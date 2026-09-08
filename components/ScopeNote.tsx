/**
 * The audit runs against a single URL, not a crawl. Say so plainly, so nobody
 * reads a homepage grade as a verdict on the whole site.
 */
export default function ScopeNote() {
  return (
    <p className="text-sm text-blue/80 max-w-lg">
      This covers the one page you entered, not every page on the site. The
      robots.txt, sitemap, and llms.txt checks look at the domain root.
    </p>
  );
}
