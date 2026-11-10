export function staffOwner(metadata:unknown){
  if(!metadata||typeof metadata!=="object")return null;
  const owner=(metadata as Record<string,unknown>).adbibe_staff_owner;
  return typeof owner==="string"&&/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(owner)?owner:null;
}
