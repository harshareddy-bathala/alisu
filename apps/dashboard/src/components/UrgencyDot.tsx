export function UrgencyDot({ urgency }: { urgency: string }) {
  let bgColor = 'bg-gray-400';
  let shouldPing = false;

  if (urgency === 'low') {
    bgColor = 'bg-gray-400';
  } else if (urgency === 'medium') {
    bgColor = 'bg-amber-400';
  } else if (urgency === 'high') {
    bgColor = 'bg-red-500';
    shouldPing = true;
  }

  return (
    <div className="relative flex h-3 w-3">
      {shouldPing && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${bgColor}`}></span>
      )}
      <span className={`relative inline-flex rounded-full h-3 w-3 ${bgColor}`}></span>
    </div>
  );
}
