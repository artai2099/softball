import { NextResponse } from "next/server";

export function rejectUntrustedOrigin(request:Request){
  const origin=request.headers.get("origin");
  const expected=new URL(request.url).origin;
  if(!origin||origin!==expected)return NextResponse.json({error:"Untrusted request origin"},{status:403});
  return null;
}
