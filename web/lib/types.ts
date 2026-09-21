export type User = { username:string|null; fio:string|null; city:string|null; church:string|null; registrationStatus:string; avatarUrl:string|null }
export type Subscription = { productId:string; productName:string; status:'none'|'pending'|'active'|'expired'|'rejected'; expiresAt:string|null; daysLeft:number|null; flowNumber:number|null }
export type Member = { name:string; username:string|null; role:'owner'|'member'; status:string }
export type Team = { id:string; name:string; church:string|null; city:string|null; viewerRole:'owner'|'member'; membersCount:number; members:Member[]; subscriptions:Subscription[] }
export type Product = { id:string; name:string; description:string; cover:string; priceRub:number|null; priceUsd:number|null; cartable:boolean; active:boolean }
export type SupportMessage = { id:string; conversationId:string; senderType:'user'|'admin'|'system'; senderId:number|null; text:string|null; attachments:Array<{type:string;fileName:string|null;mimeType:string|null}>; createdAt:string }
export type Conversation = { id:string; status:'open'|'closed'; closedBy:string|null; createdAt:string; updatedAt:string; messages?:SupportMessage[] }
