export {}
declare global {
  interface Window { Telegram?: { WebApp?: { initData:string; version:string; platform:string; ready():void; expand():void; isVersionAtLeast(version:string):boolean; BackButton:{show():void;hide():void;onClick(cb:()=>void):void;offClick(cb:()=>void):void}; HapticFeedback?:{selectionChanged():void;notificationOccurred(type:'success'|'error'|'warning'):void} } } }
}
