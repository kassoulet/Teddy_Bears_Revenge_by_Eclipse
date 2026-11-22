# Teddybear's Revenge - the effects

The demo runs at 70 Hz in VGA mode 13h (320x200, 256 colours, shown on a 4:3 monitor). The music, a 4-channel MOD, drives the schedule: the demo reads the module's `order` and compares it with a target to decide when the next part starts. The port derives the same schedule from libopenmpt (`web/timeline.js`).

| # | Effect | Starts at (music) | Ends when |
|---|---|---|---|
| 0 | Rotozoom with typewriter text | 0:00 | order 4 (`ax >= 0x400`) |
| 1 | Intro: big bear and logo over snow | 0:14 | its own zoom/flash sequence (counter) |
| 2 | 3D glenz bears | 0:20 | order 0x0A |
| 3 | Lines and credits | 0:33 | order 0x10 |
| 4 | Bitmap warp | 0:52 | order 0x11 |
| 5 | 3D phong bears | 0:55 | order 0x15 |
| 6 | Bitmap warp (second) | 1:07 | order 0x16 |
| 7 | Tunnel | 1:11 | order 0x1A |
| 8 | Bitmap warp (third) | 1:23 | order 0x1B |
| 9 | Rotozoom, ending in a fade | 1:27 | order 0x21 or the end of the palette fade, whichever comes first (the fade does) |

(Times are approximate display values: the player shows the exact ones on the effect buttons.)

## 0. Rotozoom with typewriter text

A 64x32 tile is rotated and zoomed: two orthogonal vectors (`Vect1`, `Vect2`, rotated by `Angle` with the sine table) step across the texture per pixel and per line. Resolution is halved (each sample is a 2x2 block). On top, a wobbling typewriter text (the message letters are blitted from the demo font with a vertical sine offset, `Do_Intro_Text`) appears line by line, changing on a counter driven by the music order. The same routine runs again at the end with a flag that makes the palette fade out once the music reaches order 0x1F.

## 1. Intro

A big teddy bear picture (143x150) on a plain field is zoomed with a lookup that changes scale every frame, then crossfades into the TBR logo. Behind everything is animated snow (a 4-page noise cycle). The palette is flashed to white at the transition (`Init_Flash`: every colour starts at 0x3F, then steps down by 8 per frame toward the target palette).

## 2. 3D glenz bears

Twelve copies of the bear object, each rotating with its own phase, are drawn as transparent faces: pixels are OR-ed into the hidden page, so overlapping triangles brighten into new colours. A flat shadow object (the same mesh squashed, drawn with a dark colour) lies below, and cloned objects trail with a delayed angle table. The background is the intro snow, darkened. Faces are depth-sorted every frame.

## 3. Lines and credits

A rotating cloud of 3D points joined by clipped lines (Cohen-Sutherland, then Bresenham), with a white flash entering the effect. The credits (code, art, music, fonts) appear as 3D text that drifts in along Z; a screen shake ("sport") hits at order 10, row 60.

## 4, 6, 8. Bitmap warp

A 64x64 texture (`MAP3`) shown through a polar distortion: a table of (dx, dy) offsets per radius step is regenerated every frame from two sine sweeps with changing amplitude and phase. The result is a pulsing lens/swirl. The three passes differ in speed and amplitude parameters (`prgBitmap(wait, v0, v1)`), and flash the palette at fixed music rows.

## 5. 3D phong bears

Same mesh family as the glenz part, but shaded: each vertex normal is rotated every frame and used as a coordinate into a precomputed environment disc (`Create_Circle_Phong`), so surfaces look chrome-like. Seven camera-style objects are the same mesh with axes swapped, sharing the rotation, and the object distance follows the music (`update3d2`). This part uses the opposite face-visibility test from the glenz part (`jle` instead of `jge`).

## 7. Tunnel

A 320x200 map of (distance, angle) per pixel is precomputed (distance `4800/sqrt(x^2+y^2/0.8)`, angle `atan2*128/pi`). Each frame the map is used to look up a 256x128 texture twice, with a sine wobble on the second lookup, and the two values are added modulo 256. The two lookups scroll in opposite directions, which makes the walls appear to rotate and drift. The centre, where the distance overflows, is covered by a patch of colour 144.

## 9. End

The rotozoom returns with the end flag. From order 0x1F the palette is decremented every other frame; after 126 frames everything is black and the demo exits.
