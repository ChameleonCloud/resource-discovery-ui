import { Link } from "react-router-dom";
import { CartButton } from "./CartButton";
import { FeedbackWidget } from "./FeedbackWidget";

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
