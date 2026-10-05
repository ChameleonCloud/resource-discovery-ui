import { Link } from "react-router-dom";
import { CartButton } from "./CartButton";
import { FeedbackWidget, HELP_DESK_URL } from "./FeedbackWidget";

interface Props {
  cartCount: number;
  center?: React.ReactNode;
  children: React.ReactNode;
  onLogoClick?: () => void;
  feedbackFiltersSummary?: string;
}

export function Layout({ cartCount, center, children, onLogoClick, feedbackFiltersSummary }: Props) {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="bg-[#2a2a2a] bg-[url(https://chameleoncloud.org/static/images/nav-bg.jpg)] shadow-md">
        <div className="max-w-screen-2xl mx-auto px-4 h-[70px] flex items-center gap-4 font-medium text-link">
          <a href="https://chameleoncloud.org">
            <img src="https://chameleoncloud.org/static/images/logo.png" alt="Chameleon" className="h-[60px]" />
          </a>
          <a href="https://chameleoncloud.org/about/chameleon" className="px-3.5 py-2.5">About</a>
          <a href="https://chameleoncloud.readthedocs.io/en/latest/" className="px-3.5 py-2.5">Docs</a>
          <a href={HELP_DESK_URL} className="px-3.5 py-2.5">Help Desk</a>
        </div>
      </nav>
      <header className="bg-brand-info/10 border-b border-brand-info/20 shadow-sm sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-4 h-20 flex items-center gap-4">
          <Link to="/" onClick={onLogoClick} className="hover:text-link flex-shrink-0 leading-tight">
            <div className="text-xl font-bold text-brand-primary tracking-tight">Chameleon</div>
            <div className="text-xs font-medium text-grey tracking-wide">Resource Discovery</div>
          </Link>
          <div className="flex-1 flex justify-center">{center}</div>
          <FeedbackWidget filtersSummary={feedbackFiltersSummary} />
          <CartButton count={cartCount} />
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
