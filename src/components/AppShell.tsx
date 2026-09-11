import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { switchOrganization } from "@/app/dashboard/actions";

type OrganizationOption={id:string;name:string};

export function AppShell({ children, userName,organizations,activeOrganization }: { children: React.ReactNode; userName: string;organizations:OrganizationOption[];activeOrganization:string }) {
  return <div className="shell">
    <header className="topbar"><Link href="/dashboard" className="brand"><span>G</span>GameDay Softball</Link><div className="topActions">{organizations.length>1&&<form action={switchOrganization}><select name="organizationId" defaultValue={activeOrganization} aria-label="Active organization">{organizations.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select><button className="button secondary">Switch</button></form>}<small>{userName}</small><form action={signOut}><button className="button secondary">Sign out</button></form></div></header>
    <div className="layout"><aside className="sidebar"><Link href="/dashboard">Home</Link><Link href="/dashboard/teams">Teams</Link><Link href="/dashboard/games">Games</Link><Link href="/dashboard/games/new">New game</Link><Link href="/dashboard/members">Members</Link></aside><main className="main">{children}</main></div>
  </div>;
}
