import { LiveMatchFeed } from "@/components/LiveMatchFeed";
import { getLiveMatches } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function LivePage() {
  const matches = await getLiveMatches();
  return <LiveMatchFeed initialMatches={matches} />;
}
