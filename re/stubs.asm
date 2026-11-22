; stubs.asm - the WinEOS / display services the intro calls, as one-byte functions: re/oracle.py hooks their
; addresses and implements them in Python (EOS services, int 10h/21h, palette, VGA window).
global Interrupt_EOS, Simulate_Int, _Set_Palette, Key_Map, _0a0000h
section .text
Interrupt_EOS:  ret
Simulate_Int:   ret 4
_Set_Palette:   ret
section .data
_0a0000h:       dd 0xA0000
Key_Map:        times 256 db 0
