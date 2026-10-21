/** Choose a real full-HD file instead of trusting provider-wide dimensions. */
export function chooseVideoRendition(files:any[]) {
 const usable=files.filter(f=>typeof f.link==='string'&&Number(f.width)>0&&Number(f.height)>0)
 const hd=usable.filter(f=>Math.max(f.width,f.height)>=1920&&Math.max(f.width,f.height)<=2560)
 const pool=hd.length?hd:usable
 return [...pool].sort((a,b)=>hd.length?a.width*a.height-b.width*b.height:b.width*b.height-a.width*a.height)[0]
}
