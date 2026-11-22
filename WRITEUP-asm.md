# Teddybear's Revenge - the assembly, annotated

The 1996 demo is 32-bit protected-mode NASM (about 8800 lines in `src/asm/teddy/`) running on a flat 320x200 VGA buffer. This note collects the code that does the actual work, with the matching JavaScript. Everything below was read from the source and verified frame by frame against the assembly running under Unicorn (see README).

## Frame loop and self-modifying code

Every effect is a loop of `Screen_Swap` (copy the hidden page to VRAM), draw into the hidden page, `Wait_Vbl_Teddy`. The routines are tuned with **self-modifying code**: constants are patched into the immediate operands of instructions before the hot loop (`Compt_11 equ $` labels sit right after an opcode, and `[Compt_11+3]` writes the displacement). In JavaScript these become plain local variables.

The hidden page has 200 lines of margin above it (`Min_Y=200 .. Max_Y=399` internal coordinates), so fillers can draw above the top without clipping logic; `Screen_Swap` clears 30 lines above and below before copying. The port keeps this layout (`HP = 320*200` inside one memory array).

## Rotozoom (`rotozoom.asm`, `Do_RotoZoom`)

```nasm
        mov     eax, [CoSinus+4*ebx]
        imul    eax, [Rayon]
        sar     eax, 10
        mov     [Vect1_X], eax
        ...
.Ok0:
Addr_Vect1_X1 equ $                             ; label dword
        add     edx, 0x12345678
        and     ebx, 0x1F3F
        add     ecx, ebp
Addr_Mapping1 equ $
        mov     al, [ebx+0x12345678]
        mov     bl, dh
        mov     ah, al
        mov     bh, ch
        mov     [edi], ax
        mov     [edi+320], ax
```

The texture lookup index is built from the high bytes of two 16.16 accumulators: `bl = dh` (u) and `bh = ch` (v), masked with `0x1F3F` (a 64x32 tile). One texel is written as a 2x2 block (`mov ah, al` and two word stores), so the effect really computes 160x100 samples. The loop advances along a row by `Vect1`, and to the next line by `Vect2` (the perpendicular vector, `angle+511` = +90 degrees in a 2048-step circle).

## Sine tables and fistp rounding

`Init_Sinus` fills `Sinus` with `1024*sin(2*pi*i/2048)` using `fistp`, i.e. round-to-nearest-even. JS has no such rounding, so `core.js` has `rne()`:

```js
export const rne = x => { const r = Math.round(x); return (Math.abs(x % 1) === 0.5 && r % 2) ? r - 1 : r; };
```

`Sinus2` (amplitude 64) sits right after `CoSinus` and overlays the tail of the 3072-entry table, a detail the port reproduces with `Sinus.set(...)`.

## 3D engine: Rotate_Normal (`3dkernel.asm`)

```nasm
cosinus_x_cosinus_y equ $
        imul    eax, 0x12345678
cosinus_z_sinus_x equ $
        imul    ebx, 0x12345678
...
        add     eax, edx
        add     ebx, edi
        add     ecx, ebp
```

The nine rotation coefficients (products of sine/cosine of three Euler angles, scaled) are patched into the `imul` immediates once per object per frame. Points are then rotated with plain integer math and the projected X, Y are **packed in one dword** `(X<<16)|(Y&0xFFFF)`, so later code compares or sorts two coordinates with one instruction. Shifts and the no-divide path are replicated bit for bit; a single wrong `sar` gives visible shimmer in the diff.

Faces are sorted by depth with a Lomuto-like quicksort; the port ports it exactly, since ties between equal depths change which face is painted last.

## Glenz filler (`fillglen.asm`)

```nasm
Boucle_Glenz:
        push    edx
        mov     di, si
        mov     cx, bx
        add     edi, ebp
        sub     cx, si
        jle     .Ok105
        ...
.Ok103:
        or      [edi], ax
        add     edi, 2
        dec     ecx
        jne     .Ok103
```

The "glenz" (transparent glass) look is not a blend: the pixels are OR-ed into the buffer. With a palette where colour bits are laid out so that OR produces the intended overlay colour, overlapping faces light up automatically. Edges are walked with 16.16 coefficients, `add esi, Coef_1; adc ebx, Coef_2; adc esi, 0` (two edges advanced in one carry chain). Spans are written 2 bytes at a time with an alignment fix-up.

A quirk worth documenting: in the bottom-clip path of the non-flat case the code **adds** `(y3 - Max_Y)` to the row count instead of subtracting it:

```nasm
        cmp     word [y3], Max_Y
        jle     .Ok26
        push    ecx
        mov     cx, Max_Y
        sub     cx, [y3]
        sub     dx, cx          ; dx -= (Max_Y - y3), i.e. dx += (y3 - Max_Y)
```

That draws extra rows under the object (hidden by the margin), but it matters at the screen edge. The flat-top path subtracts correctly. The JS keeps both behaviours.

## Phong environment map

`Create_Circle_Phong` builds a 256-colour disc (an environment map) once with x87 math; `Init_Phong` precomputes per-point normals. Per frame, `Rotate_Phong` rotates the normals and `Fill_Phong` (`fillmap.asm`) interpolates texture coordinates across each triangle (the code packs U and V in the two halves of a dword, as with X/Y). The disc is evaluated in JS doubles and matches the oracle exactly.

## Lines (`line.asm`)

A classic Cohen-Sutherland clipper followed by Bresenham, with the credit text drawn as rotating 3D points projected to the screen. Lines are ported one to one.

## Bitmap warp (`bitmap.asm`)

```nasm
Make_Table_:
        mov     eax, [Sinus+4*edx]
        mov     ebx, [CoSinus+4*ebp]
Amplitude_X equ $
        imul    eax, 0x12345678
Amplitude_Y equ $
        imul    ebx, 0x12345678
        add     eax, ebx
        shr     eax, 8
        shr     ebx, 8
        mov     ah, bl
        mov     [esi], ax
```

`Init_Cir` builds a polar table (`Y` in -50..49, `X` in -80..79) once; each frame `Make_Table_` builds a 256-entry table of (dx, dy) word offsets from two sine sweeps and the current amplitudes, and the bitmap lookup adds those offsets to the polar table. `shr` is logical and `imul` wraps in 32 bits: the JS uses `>>>` and `Math.imul` to match. The 64x64 texture (`MAP3`) is stored 4x4-tiled and the result is doubled to 320x200.

## Tunnel (`tunnel.asm`, `Prg_Tube`)

```nasm
.Ok1:
        mov     dx, [esi+2+ebx]
        shld    ebp, edx, 26            ; ebp = (map word >> 6) (low bits)
Compt_Sin1 equ $
        add     ebp, 0x12345678
        and     ebp, 0x7FF
        mov     ecx, edx
        add     cx, word [cs:Sinus2+4*ebp]
        and     edx, 0x3F3F
        and     ecx, 0x3F3F
Compt_1 equ $
        mov     ah, [ebx+edx+0x12345678]
        ...
Compt_11 equ $
        add     ah, [ebx+ecx+0x12345678]
```

The map is 320x200 words: high byte = distance code, low byte = angle code, built in `Init_Tube` as `round(4800/sqrt(x^2 + y^2/0.8))` and `round(atan2(y,x)*128/pi)`. Two cells are processed per iteration and each output pixel is the **sum of two texture samples**: one at the map position, one displaced by a sine wobble. `Compt`/`Compt2` scroll the two lookups in opposite directions (`-256` and `+512` per vsync). Distances above 300 would overflow the texture and become holes: they are collected in `Tbl_Zero` and `Erase_Trou` paints them (and the centre) with colour 144 afterwards. The hole list has a classic off-by-one: its last entry is overwritten with the centre pixel and entry 0 is never read; both are reproduced.

The JS inner loop:

```js
for (let k = 0, o = HP; k < 32000; k++, o += 2) {
  let v = map[2 * k + 1], e = (((v >>> 6) + S.sin) & 0x7FF);
  let c = (v + Sinus2[e]) & 0x3F3F; v &= 0x3F3F;
  const hi = (pic[v + d1] + pic[c + d11]) & 255;
  ...
}
```

## Things that bite when porting

- `fistp` rounds to nearest even; JS `Math.round` rounds .5 up.
- `imul` with a 32-bit result wraps; use `Math.imul`.
- `shr` versus `sar`, and 16-bit register parts: mixing `ax` and `eax` leaves the upper half untouched (e.g. `mov bp, ax` after `xor ebp, ebp`).
- `Centre_X` is `(Max_X-Min_X)/2 = 159`, not 160.
- Self-modified immediates: the value in effect is the one written last before the loop runs, which is not always the constant in the source.
- A palette array shorter than 768 bytes read by `Set_Palette` aliases the next variables.
