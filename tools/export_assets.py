#!/usr/bin/env python3
"""export_assets.py: copy the data tables that the asm only has as assembled .data blobs (rotozoom tile, text wobble phases,
meshes...) out of the oracle's memory dump (re/golden/mem_5.bin, taken after Init_*) into web/assets/. The file images
(BIGBEAR, MAP3...) are copied from the upstream data dir. usage: export_assets.py"""
import zlib,os,sys,shutil
H=os.path.dirname(os.path.abspath(__file__))+'/../'
sym={}
for l in open(H+'re/build/oracle.sym'):
    a,t,n=l.split(); sym[n]=int(a,16)
mem=zlib.decompress(open(H+'re/golden/mem_5.bin','rb').read()); B=0x400000
def blob(name,n): return mem[sym[name]-B:sym[name]-B+n]
out=H+'web/assets/'; D=H+'sources/teddybears-revenge/src/data/'
for n in ('BIGBEAR','MAP3','TBR-FONT','TBR-LOGO','TBR-TEXT'):
    for e in ('PAL','RAW'): shutil.copy(D+n+'.'+e,out+n+'.'+e)
jobs={'teddy.bin':('Teddy',768+17*40),'angtext.bin':('List_ANgle_Text',4*64),'angtext2.bin':('List_ANgle_Text2',4*64)}
for f,(s,n) in jobs.items(): open(out+f,'wb').write(blob(s,n)); print(f,n)

import struct,json
def dw(name,i=0): return struct.unpack('<I',blob(name,4*(i+1))[4*i:])[0]
def heap(a,n): return mem[0x200000+a-0x1000000:0x200000+a-0x1000000+n]
# snow noise: Create_Neige output (seeded from code bytes + heap address in the original, so only this sample is "real")
L=dw('List_Neige'); open(out+'snow.bin','wb').write(heap(L,3*64000+326*200)); print('snow.bin',L)

# the six scroller texts, as one raw blob (Change_Carac reads 15*19 bytes per text, running into the next data for short ones)
base=sym['_Text_1']; end=sym['_Text_6']+15*19+32
open(out+'texts.bin','wb').write(blob('_Text_1',end-base))
json.dump({n:sym['_Text_%d'%n]-base for n in range(1,7)},open(out+'texts.json','w')); print('texts',end-base)

# 3D meshes (relocatable blobs from object3d.asm) + the phong palette; code addresses stored in the blobs are named in mesh.json
s1=sym['Camera01']-sym['Objet01']; s2=sym['Camera01_D_Coor_PVect_XYZ']+876*2-sym['Camera01']
open(out+'mesh.bin','wb').write(blob('Objet01',s1)+blob('Camera01',s2))
json.dump({'size1':s1,'size2':s2,'RotatePhong':sym['Rotate_Phong'],'RotateNormal':sym['Rotate_Normal'],'FillPhong':sym['Fill_Phong'],'FillGlenz':sym['Fill_Glenz']},open(out+'mesh.json','w'))
open(out+'phong.pal','wb').write(blob('Palette_Phong',768)); print('mesh',s1,s2)
open(out+'line.pal','wb').write(blob('Palette_Line',768))
open(out+'tunnel.pal','wb').write(blob('Palette_Tunnel',768))
