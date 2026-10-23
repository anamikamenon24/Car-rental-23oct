import Link from "next/link";
import { Logo } from "./logo";

export function SiteFooter() {
  return (
    <footer className="no-print mt-16 border-t border-ink-200 bg-brand-950 text-brand-100">
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo inverted />
          <p className="mt-3 max-w-sm text-sm text-brand-200">
            Car rental across the UAE with transparent AED pricing. All prices include 5% VAT where shown and
            times are shown in each branch&apos;s local time.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Rent</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="hover:text-white" href="/search">
                Find a car
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" href="/branches">
                Branches
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Account</h2>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link className="hover:text-white" href="/account/rentals">
                My rentals
              </Link>
            </li>
            <li>
              <Link className="hover:text-white" href="/account/profile">
                Profile
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-brand-300 sm:px-6">
          © DriveEasy Car Rental LLC · United Arab Emirates
        </p>
      </div>
    </footer>
  );
}
