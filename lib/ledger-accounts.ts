import {accountEmail} from '@/lib/account-label';
export type CreditAccount={id:string;label:string;balance:string|null;unlimited:number;observedAt:string;confirmed:number;pending:number};
export function groupCreditAccounts(accounts:CreditAccount[]):CreditAccount[]{
 const groups=new Map<string,CreditAccount>();
 for(const account of accounts){const email=accountEmail(account.label)?.toLowerCase(),key=email||account.id,previous=groups.get(key),label=email||account.label;
  if(!previous){groups.set(key,{...account,label});continue;}
  const latest=account.observedAt>previous.observedAt?account:previous;
  groups.set(key,{...latest,id:[previous.id,account.id].sort()[0],label,confirmed:Number(previous.confirmed)+Number(account.confirmed),pending:Number(previous.pending)+Number(account.pending)});
 }
 return [...groups.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
