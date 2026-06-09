export default function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
      <div>
        {eyebrow && (
          <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-red-800 mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-heading text-3xl sm:text-4xl tracking-tight font-bold text-gray-900">
          {title}
        </h1>
        {description && (
          <p className="text-sm text-gray-500 mt-2 max-w-xl leading-relaxed">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
