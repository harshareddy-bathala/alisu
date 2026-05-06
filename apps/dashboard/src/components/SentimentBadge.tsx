export function SentimentBadge({ sentiment }: { sentiment: string }) {
  let colors = 'bg-gray-100 text-gray-700';

  switch (sentiment) {
    case 'calm':
      colors = 'bg-green-100 text-green-800';
      break;
    case 'frustrated':
      colors = 'bg-amber-100 text-amber-800';
      break;
    case 'urgent':
      colors = 'bg-orange-100 text-orange-800';
      break;
    case 'distressed':
      colors = 'bg-red-100 text-red-800 animate-pulse';
      break;
    case 'confused':
      colors = 'bg-gray-100 text-gray-700';
      break;
    default:
      break;
  }

  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium uppercase tracking-wide ${colors}`}>
      {sentiment}
    </span>
  );
}
