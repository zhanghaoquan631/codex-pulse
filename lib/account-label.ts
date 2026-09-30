export function accountEmail(value:unknown):string|null {
 if(typeof value!=="string")return null;
 const email=value.trim();return email.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)?email:null;
}
export function validAccountLabel(value:unknown){return !!accountEmail(value)||(typeof value==="string"&&/^账号 \d+$/.test(value));}
