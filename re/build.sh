#!/bin/bash
# Assemble the intro's own asm (untouched upstream sources) + stubs into a flat 32-bit image for the Unicorn oracle.
set -e
cd "$(dirname "$0")"; S=../sources/teddybears-revenge/src/asm/teddy; B=build
for f in teddy fillflat fillglen fillmap; do nasm -f elf32 -DWIN32=1 -D_WIN32=1 -I$S/ -I$S/../ -o $B/$f.o $S/$f.asm; done
nasm -f elf32 -o $B/stubs.o stubs.asm
ld -m elf_i386 -N -Ttext=0x400000 -e Start32 -o $B/oracle.elf $B/teddy.o $B/fillflat.o $B/fillglen.o $B/fillmap.o $B/stubs.o
objcopy -O binary $B/oracle.elf $B/oracle.bin
nm -n $B/oracle.elf > $B/oracle.sym
ls -l $B/oracle.bin; wc -l $B/oracle.sym
