#!/usr/bin/env python3
"""frame2png.py GOLDEN_DIR N OUT.png [scale]  : golden frame N (VRAM indices + palette) as a 4:3 PNG."""
import sys,json,zlib
from PIL import Image
d,n,out=sys.argv[1],int(sys.argv[2]),sys.argv[3]; sc=int(sys.argv[4]) if len(sys.argv)>4 else 2
m=json.load(open(d+'/meta.json')); o,l,pi,_,_=m['frames'][n]
fr=zlib.decompress(open(d+'/frames.bin','rb').read()[o:o+l]); p=bytes.fromhex(m['pals'][pi])
im=Image.frombytes('P',(320,200),fr); im.putpalette(bytes((v<<2|v>>4) for v in p)); im.convert('RGB').resize((320*sc,240*sc),Image.NEAREST).save(out)
