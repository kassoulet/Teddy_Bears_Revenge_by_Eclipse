#!/usr/bin/env python3
"""oracle.py: run the intro's real asm (re/build.sh -> build/oracle.bin, the upstream NASM sources) under Unicorn with Python
stubs for WinEOS (re/stubs.asm), a virtual 70 Hz vsync clock and the MOD position from re/timeline.json (libopenmpt),
and capture one golden frame (320x200 VRAM + 6-bit palette + music order/row) per Wait_Vbl.
usage: oracle.py [max_frames] [out_dir]   -> out_dir/frames.bin (zlib per frame), meta.json"""
import sys,os,json,zlib,struct,bisect,time
from unicorn import *
from unicorn.x86_const import *
H=os.path.dirname(os.path.abspath(__file__)); D=H+'/../sources/teddybears-revenge/src/data/'
MAXF=int(sys.argv[1]) if len(sys.argv)>1 else 100000; OUT=sys.argv[2] if len(sys.argv)>2 else H+'/golden'
os.makedirs(OUT,exist_ok=True)
img=open(H+'/build/oracle.bin','rb').read(); sym={}
for l in open(H+'/build/oracle.sym'):
    a,t,n=l.split(); sym[n]=int(a,16)
tl=json.load(open(H+'/timeline.json'))['rows']; tl_t=[r[3] for r in tl]
BASE=0x400000; HEAP=0x1000000; VGA=0xA0000
uc=Uc(UC_ARCH_X86,UC_MODE_32)
uc.mem_map(BASE,0x200000); uc.mem_write(BASE,img)
uc.mem_map(0x600000,0x200000); uc.mem_map(VGA,0x10000); uc.mem_map(HEAP,0x4000000)
uc.reg_write(UC_X86_REG_ESP,0x7F0000); uc.reg_write(UC_X86_REG_EIP,sym['Start32'])
EOS,SIM,SETPAL=sym['Interrupt_EOS'],sym['Simulate_Int'],sym['_Set_Palette']
heap=HEAP; files={}
def file_image(name):
    b=os.path.basename(name.replace('\\','/')).split('.')[0]
    return open(D+b+'.PAL','rb').read()+open(D+b+'.RAW','rb').read()
def cstr(a):
    s=b''
    while True:
        c=uc.mem_read(a,1)[0]
        if not c: return s.decode()
        s+=bytes([c]); a+=1
pal=bytearray(768); vbl=0; kplay=None; frames=[]; metas=[]; pals=[]; palidx=-1; fout=open(OUT+'/frames.bin','wb'); pos=0
def info():
    if kplay is None: return 0,0,0
    t=(vbl-kplay)/70.0; i=max(0,bisect.bisect_right(tl_t,t)-1); o,p,r,_=tl[i]; return o,p,r
def hook(uc,addr,size,ud):
    global heap,vbl,kplay,palidx,pos
    if addr==EOS:
        ah=(uc.reg_read(UC_X86_REG_EAX)>>8)&0xFF; ef=uc.reg_read(UC_X86_REG_EFLAGS); uc.reg_write(UC_X86_REG_EFLAGS,ef&~1)
        if ah==0x40:   # Allocate_Memory: edx=size -> edx=addr, eax=phys (=addr)
            sz=uc.reg_read(UC_X86_REG_EDX); uc.reg_write(UC_X86_REG_EDX,heap); uc.reg_write(UC_X86_REG_EAX,heap); heap+=(sz+15)&~15
        elif ah==0x10: # Load_Internal_File: edx=name -> eax=addr, ecx=size, esi=phys, edi=handle
            b=file_image(cstr(uc.reg_read(UC_X86_REG_EDX))); uc.mem_write(heap,b)
            for r,v in ((UC_X86_REG_EAX,heap),(UC_X86_REG_ECX,len(b)),(UC_X86_REG_ESI,heap),(UC_X86_REG_EDI,heap)): uc.reg_write(r,v)
            heap+=(len(b)+15)&~15
        elif ah==0x20: # Wait_Vbl: one frame captured here
            if kplay is not None or True:
                global palidx
                if palidx<0 or pals[palidx]!=bytes(pal): pals.append(bytes(pal)); palidx=len(pals)-1
                z=zlib.compress(bytes(uc.mem_read(VGA,64000)),1); fout.write(z)
                o,p,r=info(); metas.append([pos,len(z),palidx,o,r]); pos+=len(z)
            if len(metas)-1 in DUMPF:
                open(OUT+'/mem_%d.bin'%(len(metas)-1),'wb').write(zlib.compress(bytes(uc.mem_read(BASE,0x200000))+bytes(uc.mem_read(HEAP,heap-HEAP)),1))
            vbl+=1
            if len(metas)>=MAXF: uc.emu_stop()
            if len(metas)%500==0: print(len(metas),'frames',time.time()-T0,'s',flush=True)
        elif ah==0x34: kplay=vbl     # Play_Module: music clock starts
        elif ah==0x3E: # Get_Info: ah=order al=pattern bl=row
            o,p,r=info(); uc.reg_write(UC_X86_REG_EAX,(uc.reg_read(UC_X86_REG_EAX)&~0xFFFF)|(o<<8)|p); uc.reg_write(UC_X86_REG_EBX,r)
        elif ah==0x07 or ah==0x01: uc.emu_stop(); print('exit via EOS',hex(ah))
        elif ah in (0x30,0x32,0x3A,0x41): pass
        else: print('EOS service?',hex(ah))
    elif addr==SETPAL:
        sp=uc.reg_read(UC_X86_REG_ESP); org,ln,ptr=struct.unpack('<iii',uc.mem_read(sp+4,12))
        pal[org*3:org*3+ln]=bytes(b&63 for b in uc.mem_read(ptr,ln))
    elif addr==SIM:
        sp=uc.reg_read(UC_X86_REG_ESP); n=struct.unpack('<I',uc.mem_read(sp+4,4))[0]; ax=uc.reg_read(UC_X86_REG_EAX)&0xFFFF
        if n==0x21: uc.emu_stop(); print('int 21h exit',hex(ax))
        elif n==0x10 and ax==0x13: uc.mem_write(VGA,bytes(64000))   # BIOS mode set clears VRAM
uc.hook_add(UC_HOOK_CODE,hook,begin=EOS,end=EOS); uc.hook_add(UC_HOOK_CODE,hook,begin=SIM,end=SIM); uc.hook_add(UC_HOOK_CODE,hook,begin=SETPAL,end=SETPAL)
T0=time.time()
DUMPF=set(int(x) for x in os.environ.get('DUMPF','').split(',') if x)
try: uc.emu_start(sym['Start32'],0,timeout=0,count=0)
except UcError as e: print('UcError',e,'eip=%x'%uc.reg_read(UC_X86_REG_EIP))
fout.close(); json.dump({'kplay':kplay,'heap':heap-HEAP,'frames':metas,'pals':[p.hex() for p in pals]},open(OUT+'/meta.json','w'))
if OUT==H+'/golden':
    for n in ('Sinus','CoSinus','Sinus2','Hidden_Page','Tbl_Zero'):
        pass
print('done',len(metas),'frames',len(pals),'palettes',time.time()-T0,'s')
