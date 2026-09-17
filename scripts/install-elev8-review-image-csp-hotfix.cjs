const fs=require('fs'),path=require('path');
const file=path.join(process.cwd(),'public','manual-review-image-import.js');
if(!fs.existsSync(file))throw new Error(`Missing ${file}`);
let src=fs.readFileSync(file,'utf8');

const oldFn=`  async function compress(file){
    const img=await new Promise((resolve,reject)=>{
      const url=URL.createObjectURL(file),image=new Image();
      image.onload=()=>{URL.revokeObjectURL(url);resolve(image)};
      image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error(\`Could not read \${file.name}\`))};
      image.src=url;
    });
    const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.75);
  }`;

const newFn=`  async function compress(file){
    if(!file)throw new Error('No image file was provided.');
    if(!/^image\\/(png|jpeg|jpg|webp)$/i.test(String(file.type||''))){
      throw new Error(\`Unsupported image type for \${file.name||'image'}\`);
    }

    const dataUrl=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result||''));
      reader.onerror=()=>reject(new Error(\`Could not read \${file.name||'image'}\`));
      reader.readAsDataURL(file);
    });

    const img=await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error(\`Could not decode \${file.name||'image'}\`));
      image.src=dataUrl;
    });

    const max=1400,scale=Math.min(1,max/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Browser image canvas is unavailable.');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.75);
  }`;

if(!src.includes(oldFn))throw new Error('Expected compress() implementation not found. Refusing to patch an unknown file shape.');
src=src.replace(oldFn,newFn);
fs.writeFileSync(file,src);
console.log('✓ Review screenshot reader now uses CSP-safe data: URLs');
