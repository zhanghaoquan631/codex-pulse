export type QuotaWindow={usedPercent:number|null;windowDurationMins:number|null;resetsAt:number|null};
export type QuotaResetCredits={availableCount:number;credits:{title:string|null;description?:string|null;resetType?:string|null;status:string|null;expiresAt:number|null;expiresDateLabel?:string;noExpiry?:boolean;grantedAt:number|null}[]|null};
export type OfficialResetHistoryEntry={kind:'granted'|'redeemed';occurredAt:string};
export type OfficialAccountLocator={usageUrl:string;accountUrl:string;browser?:'chrome'|'edge'|'iab';providerTabId?:string;extensionInstanceId?:string;browserProfileName?:string;verifiedAt:string};
export type OfficialEvidenceSource='official-page'|'official-screenshot';
export type OfficialEvidenceValue<T>={value:T;observedAt:string;source?:OfficialEvidenceSource};
export type OfficialBillingEvidence={value:{renewalDate?:string;periodEndDate?:string;autoRenew:boolean};observedAt:string;source:OfficialEvidenceSource};
export type OfficialQuotaEvidence={email:string;verifiedEmail:string;observedAt:string;source:OfficialEvidenceSource;plan?:OfficialEvidenceValue<string>;windows?:OfficialEvidenceValue<QuotaWindow[]>;balance?:OfficialEvidenceValue<string>;resetCredits?:OfficialEvidenceValue<QuotaResetCredits>;resetHistory?:OfficialEvidenceValue<OfficialResetHistoryEntry[]>;billing?:OfficialBillingEvidence;locator?:OfficialAccountLocator};
export type OfficialQuotaField='planType'|'resetCredits'|'windows'|'balance'|'billing';
export type QuotaProfile={email:string;observedAt:string;source:'account-api'|'session-log'|'official-page';planType:string|null;windows:QuotaWindow[];resetCredits:QuotaResetCredits|null;balance:string|null;subscription:{activeFrom:string|null;activeUntil:string|null;checkedAt:string|null}|null;officialEvidence?:OfficialQuotaEvidence;officialFields?:OfficialQuotaField[]};
export type KnownAccount={id:string;email:string;lastSeen:string};
export type QuotaRegistration={email:string;name:string;hidden:number};
export function weeklyWindow(profile?:QuotaProfile){return profile?.windows.find(w=>w.windowDurationMins===10080);}
export function remaining(window?:QuotaWindow){return typeof window?.usedPercent==='number'&&Number.isFinite(window.usedPercent)?Math.max(0,Math.min(100,100-window.usedPercent)):null;}
export function isLive(profile:QuotaProfile|undefined,now:number,currentEmail:string|null){return !!profile&&profile.email.toLowerCase()===currentEmail?.toLowerCase()&&profile.source==='account-api'&&now-Date.parse(profile.observedAt)<150000&&Date.parse(profile.observedAt)<=now+5000;}
export function resetSort(a?:QuotaWindow,b?:QuotaWindow){return (a?.resetsAt??Infinity)-(b?.resetsAt??Infinity);}
