"use client";

import { useEffect } from "react";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { switchOrganization } from "@/app/dashboard/actions";

type OrganizationOption = {
  id: string;
  name: string;
};

const teamNavigation = [
  { href: "/dashboard", label: "Home" },
  { href: "/dashboard/teams", label: "Teams" },
  { href: "/dashboard/teams/find", label: "Find a Team" },
];

const organizationNavigation = [
  { href: "/dashboard/games", label: "Games" },
  { href: "/dashboard/games/new", label: "New Game" },
  { href: "/dashboard/members", label: "Members" },
];

export function AppShell({
  children,
  userName,
  organizations,
  activeOrganization,
  hasOrganizationMembership,
}: {
  children: React.ReactNode;
  userName: string;
  organizations: OrganizationOption[];
  activeOrganization: string;
  hasOrganizationMembership: boolean;
}) {
  const navigation = hasOrganizationMembership
    ? [...teamNavigation, ...organizationNavigation]
    : teamNavigation;
  useEffect(() => {
    const closeNavigationMenus = () => {
      document
        .querySelectorAll("details[open]")
        .forEach((element) => {
          (element as HTMLDetailsElement).open = false;
        });

      document
        .querySelectorAll(
          "[data-menu-open='true'], [aria-expanded='true'][data-menu-trigger]",
        )
        .forEach((element) => {
          element.setAttribute("aria-expanded", "false");
        });

      document
        .querySelectorAll(".mobileMenu.open, .mobileMenu.is-open")
        .forEach((element) => {
          element.classList.remove("open", "is-open");
        });
    };

    const handleNavigationClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target) return;

      const link = target.closest("a");
      if (!link) return;

      closeNavigationMenus();
    };

    document.addEventListener("click", handleNavigationClick, true);

    return () => {
      document.removeEventListener("click", handleNavigationClick, true);
    };
  }, []);

  return (
    <div className="gdpShell">
      <style>{`
        .gdpShell {
          min-height: 100vh;
          background: #f3f5f8;
          color: #fff;
        }

        .gdpShell .topbar {
          height: 68px;
          display: flex;
          align-items: center;
          padding: 0 16px;
          background: #061f45;
          border-bottom: 3px solid #e50046;
          box-sizing: border-box;
          position: sticky;
          top: 0;
          z-index: 100;
          gap: 12px;
        }

        .gdpShell .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          text-decoration: none;
          color: #fff;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: .05em;
          text-transform: uppercase;
          min-width: 0;
        }

        .gdpShell .brand span {
          width: 34px;
          height: 34px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
          border-radius: 50%;
          background: #fff;
          color: #e50046;
          border: 3px solid #e50046;
          font-size: 17px;
          font-weight: 900;
        }

        .gdpShell .topActions {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-left: auto;
        }

        .gdpShell .topActions form {
          display: flex;
          align-items: center;
          gap: 6px;
          margin: 0;
        }

        .gdpShell .topActions select {
          height: 34px;
          min-width: 165px;
          border-radius: 4px;
          border: 1px solid #9ea6b3;
          background: #f5f5f5;
          color: #171717;
          padding: 0 7px;
        }

        .gdpShell .topActions small {
          color: #dce2eb;
          font-size: 12px;
        }

        .gdpShell .topActions .button {
          min-height: 34px;
          border-radius: 7px;
          padding: 0 14px;
          font-weight: 800;
        }

        .gdpShell .topActions .secondary {
          background: #edf2f8;
          color: #09234a;
          border: 1px solid #d6dce5;
        }

        .gdpShell .layout {
          display: block;
          min-height: calc(100vh - 68px);
        }

        .gdpShell .sidebar {
          display: none;
        }

        .gdpShell .main {
          min-width: 0;
          background: #f3f5f8;
          padding: 28px;
          box-sizing: border-box;
        }

        .gdpShell .gdpContent {
          width: min(100%, 960px);
          min-height: calc(100vh - 124px);
          background: #050505;
          color: #f5f5f5;
          padding: 28px;
          box-sizing: border-box;
        }

        .gdpShell .gdpContent h1,
        .gdpShell .gdpContent h2,
        .gdpShell .gdpContent h3 {
          color: #fff;
        }

        .gdpShell .gdpContent .pageHead {
          color: #fff;
          margin-bottom: 22px;
        }

        .gdpShell .gdpContent .eyebrow,
        .gdpShell .gdpContent .liveLabel {
          color: #9b9ba3;
        }

        .gdpShell .gdpContent .muted,
        .gdpShell .gdpContent .notice {
          color: #aeb5c0;
        }

        .gdpShell .gdpContent .card,
        .gdpShell .gdpContent .panel,
        .gdpShell .gdpContent .empty {
          background: #0d0d0f;
          color: #f5f5f5;
          border: 1px solid #25272c;
          border-radius: 10px;
          box-shadow: none;
        }

        .gdpShell .gdpContent .card {
          padding: 20px;
        }

        .gdpShell .gdpContent .grid {
          gap: 16px;
        }

        .gdpShell .gdpContent .grid > .card {
          text-decoration: none;
        }

        .gdpShell .gdpContent .grid > .card:hover {
          border-color: #454851;
        }

        .gdpShell .gdpContent input,
        .gdpShell .gdpContent select,
        .gdpShell .gdpContent textarea {
          background: #151619;
          color: #fff;
          border: 1px solid #363941;
          border-radius: 7px;
        }

        .gdpShell .gdpContent label {
          color: #d7dbe2;
        }

        .gdpShell .gdpContent .button.primary,
        .gdpShell .gdpContent .button.red {
          background: #7c2cff;
          border-color: #7c2cff;
          color: #fff;
          border-radius: 7px;
          font-weight: 800;
        }

        .gdpShell .gdpContent .button.secondary {
          background: #121316;
          border-color: #373940;
          color: #f5f5f5;
          border-radius: 7px;
          font-weight: 750;
        }

        .gdpShell .gdpContent .teamCode {
          border-radius: 9px;
        }

        /* Hamburger menu - desktop and mobile */
        .gdpShell .mobileMenu {
          display: block;
          position: relative;
          flex: 0 0 auto;
          order: -1;
        }

        .gdpShell .mobileMenu > summary {
          list-style: none;
          width: 44px;
          height: 44px;
          display: grid;
          place-items: center;
          cursor: pointer;
          border-radius: 8px;
          background: #0d2b55;
          border: 1px solid #426184;
          color: #fff;
        }

        .gdpShell .mobileMenu > summary::-webkit-details-marker {
          display: none;
        }

        .gdpShell .hamburger {
          width: 22px;
          height: 16px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .gdpShell .hamburger span {
          display: block;
          width: 100%;
          height: 2px;
          border-radius: 2px;
          background: #fff;
        }

        .gdpShell .mobileMenu[open] > summary {
          background: #7c2cff;
          border-color: #7c2cff;
        }

        .gdpShell .mobileNav {
          position: absolute;
          left: 0;
          top: 52px;
          width: 300px;
          max-width: calc(100vw - 32px);
          padding: 8px;
          background: #0b0d11;
          border: 1px solid #30343c;
          border-radius: 12px;
          box-shadow: 0 18px 45px rgba(0, 0, 0, .45);
          box-sizing: border-box;
        }

        .gdpShell .mobileNav a {
          min-height: 46px;
          display: flex;
          align-items: center;
          padding: 0 14px;
          border-radius: 8px;
          color: #f2f4f7;
          text-decoration: none;
          font-size: 15px;
          font-weight: 800;
        }

        .gdpShell .mobileNav a:hover {
          background: #171a20;
        }

        .gdpShell .mobileNavDivider {
          height: 1px;
          margin: 8px 4px;
          background: #292d35;
        }

        .gdpShell .mobileNavUser {
          padding: 10px 14px 6px;
          color: #aeb5c0;
          font-size: 12px;
          font-weight: 700;
        }

        .gdpShell .mobileNav form {
          margin: 0;
        }

        .gdpShell .mobileNav select {
          width: 100%;
          min-height: 42px;
          margin-bottom: 8px;
          padding: 0 10px;
          background: #151619;
          color: #fff;
          border: 1px solid #363941;
          border-radius: 7px;
          box-sizing: border-box;
        }

        .gdpShell .mobileNav button {
          width: 100%;
          min-height: 42px;
        }

        @media (max-width: 800px) {
          .gdpShell .topbar {
            padding: 0 10px;
          }

          .gdpShell .topActions {
            display: none;
          }

          .gdpShell .brand {
            font-size: 14px;
          }

          .gdpShell .main {
            padding: 14px;
          }

          .gdpShell .gdpContent {
            width: 100%;
            min-height: calc(100vh - 96px);
            padding: 18px;
          }
        }

        @media (max-width: 430px) {
          .gdpShell .brand {
            font-size: 12px;
            gap: 8px;
          }

          .gdpShell .brand span {
            width: 31px;
            height: 31px;
            font-size: 15px;
          }

          .gdpShell .gdpContent {
            padding: 14px;
          }

          .gdpShell .mobileNav {
            width: 280px;
          }
        }
      `}</style>

      <header className="topbar">
        <details className="mobileMenu">
          <summary aria-label="Open navigation menu">
            <span className="hamburger" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </summary>

          <nav className="mobileNav">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href}>
                {item.label}
              </Link>
            ))}

            <div className="mobileNavDivider" />

            <div className="mobileNavUser">{userName}</div>

            <form action={switchOrganization}>
              <select
                name="organizationId"
                defaultValue={activeOrganization}
                aria-label="Organization"
              >
                {organizations.map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
              </select>

              <button type="submit" className="button secondary">
                Switch Organization
              </button>
            </form>

            <div className="mobileNavDivider" />

            <form action={signOut}>
              <button type="submit" className="button secondary">
                Sign Out
              </button>
            </form>
          </nav>
        </details>

        <Link href="/dashboard" className="brand">
          <span>G</span>
          GameDay Softball
        </Link>

        <div className="topActions">
          <form action={switchOrganization}>
            <select
              name="organizationId"
              defaultValue={activeOrganization}
              aria-label="Organization"
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>

            <button type="submit" className="button secondary">
              Switch
            </button>
          </form>

          <small>{userName}</small>

          <form action={signOut}>
            <button type="submit" className="button secondary">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </aside>

        <main className="main">
          <div className="gdpContent">{children}</div>
        </main>
      </div>
    </div>
  );
}
