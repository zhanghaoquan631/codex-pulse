// Accept bounded, 8-bit RGB/RGBA PNG only. Check CRCs and decompressed scanlines,
// then discard metadata so uploads cannot carry HTML, SVG, or ancillary payloads.
export async function cleanPng(bytes:Uint8Array){
  if(bytes.length>3_000_000||bytes.length<57||![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw new Error('Invalid PNG');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),keep:Uint8Array[]=[bytes.slice(0,8)],idat:Uint8Array[]=[];
  let p=8,width=0,height=0,channels=0,ended=false,seenData=false,dataEnded=false;
  while(p<bytes.length){
    if(p+12>bytes.length)throw new Error('Truncated PNG');const n=view.getUint32(p),type=new TextDecoder().decode(bytes.slice(p+4,p+8));if(n>bytes.length-p-12)throw new Error('Truncated chunk');
    let crc=0xffffffff;for(let i=p+4;i<p+8+n;i++){crc^=bytes[i];for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}if((crc^0xffffffff)>>>0!==view.getUint32(p+8+n))throw new Error('CRC');
    if(p===8&&type!=='IHDR')throw new Error('Header');
    if(type==='IHDR'){if(p!==8||n!==13)throw new Error('Header');width=view.getUint32(p+8);height=view.getUint32(p+12);channels=bytes[p+17]===6?4:bytes[p+17]===2?3:0;if(!width||!height||width>2400||height>2400||width*height>2_500_000||bytes[p+16]!==8||!channels||bytes[p+18]||bytes[p+19]||bytes[p+20])throw new Error('Dimensions');keep.push(bytes.slice(p,p+n+12));}
    else if(type==='IDAT'){if(dataEnded)throw new Error('Data order');seenData=true;idat.push(bytes.slice(p+8,p+8+n));keep.push(bytes.slice(p,p+n+12));}
    else if(type==='IEND'){if(n||!seenData||p+12!==bytes.length)throw new Error('End');keep.push(bytes.slice(p,p+12));ended=true;}
    else {if(seenData)dataEnded=true;if(type[0]===type[0].toUpperCase())throw new Error('Unsupported chunk');}
    p+=n+12;
  }
  if(!ended)throw new Error('Missing end');
  const packed=new Blob(idat as BlobPart[]).stream().pipeThrough(new DecompressionStream('deflate')).getReader(),row=width*channels+1,expected=row*height;let total=0;
  while(true){const {done,value}=await packed.read();if(done)break;for(let i=0;i<value.length;i++)if((total+i)%row===0&&value[i]>4)throw new Error('Filter');total+=value.length;if(total>expected){await packed.cancel();throw new Error('Pixel overflow');}}
  if(total!==expected)throw new Error('Pixel length');
  return {bytes:await new Blob(keep as BlobPart[]).arrayBuffer(),width,height};
}
