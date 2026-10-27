// A successful destructive transaction invalidates outstanding derived work.
// This stores no user content and introduces no reverse dependency on features.
let generation=0;
const listeners=new Set<()=>void>();
export const memoryCacheGeneration=()=>generation;
export function onMemoryCacheInvalidated(listener:()=>void){listeners.add(listener);return ()=>listeners.delete(listener);}
export function invalidateMemoryCaches(){generation++;for(const listener of listeners)listener();}
