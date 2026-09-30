export const USD_PER_CREDIT=0.04;
export function decimal(value:unknown){const number=typeof value==="string"&&/^\d+(?:\.\d{1,8})?$/.test(value)?Number(value):typeof value==="number"?value:NaN;return Number.isFinite(number)&&number>=0&&number<=1e12?number:null;}
export function usdMicros(amount:number,rate:number){const value=Math.round(amount*rate*1e6);if(!Number.isSafeInteger(value)||value<0)throw new Error("金额超出可记录范围");return value;}
export function validDate(value:unknown){return typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+"T00:00:00Z"))&&new Date(value+"T00:00:00Z").toISOString().slice(0,10)===value;}
export async function exchangeRate(currency:string,date:string){
 if(!validDate(date)||date>new Date(Date.now()+8*3600000).toISOString().slice(0,10))throw new Error("请选择有效日期，不能记录未来支出");
 if(currency==="CREDITS")return {rate:USD_PER_CREDIT,date,source:"用户设定：250 额度 = 10 USD"};
 if(currency==="USD")return {rate:1,date,source:"USD"};
 if(!/^[A-Z]{3}$/.test(currency))throw new Error("请输入三位货币代码，如 PHP、CNY、EUR");
 const response=await fetch(`https://api.frankfurter.dev/v2/rate/${currency.toLowerCase()}/usd?date=${date}`,{signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw new Error("暂时没有这个日期或币种的汇率，请核对后重试");
 const data=await response.json() as {rate:number;date:string;base:string;quote:string};
 if(!Number.isFinite(data.rate)||data.rate<=0||!validDate(data.date)||data.date>date||data.base!==currency||data.quote!=="USD")throw new Error("汇率数据不完整，请稍后重试");
 return {rate:data.rate,date:data.date,source:"Frankfurter"};
}
