import { type Components } from "react-markdown";
import { cn } from "@/lib/utils";

export const mdComponents: Components = {
  h1: ({ className, children, ...props }) => (
    <h1 className={cn("text-2xl font-bold mt-4 mb-2", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2 className={cn("text-xl font-bold mt-3 mb-2", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3 className={cn("text-lg font-bold mt-3 mb-1", className)} {...props}>
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }) => (
    <p className={cn("mb-4 leading-7 text-slate-700", className)} {...props}>
      {children}
    </p>
  ),
  a: ({ className, children, href, ...props }) => (
    <a
      className={cn(
        "relative -top-1.5 mx-0.5 inline-flex h-[16px] min-w-[16px] cursor-pointer items-center justify-center rounded-full border border-teal-200/80 bg-teal-50/70 px-1 text-[9px] font-bold text-teal-800 no-underline transition-colors hover:bg-white/70 hover:text-teal-950",
        className
      )}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
  ul: ({ className, children, ...props }) => (
    <ul className={cn("mb-4 list-disc pl-6 text-slate-700", className)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }) => (
    <ol className={cn("mb-4 list-decimal pl-6 text-slate-700", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }) => (
    <li className={cn("mb-1.5 pl-1", className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ className, children, ...props }) => (
    <blockquote
      className={cn(
        "my-3 border-l-4 border-teal-500/35 pl-4 text-sm italic text-slate-600",
        className
      )}
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) => (
    <code
      className={cn(
        "rounded-md bg-white/55 px-1.5 py-0.5 font-mono text-xs text-teal-900 ring-1 ring-white/50",
        className
      )}
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ className, children, ...props }) => (
    <pre
      className={cn(
        "my-4 overflow-x-auto whitespace-pre-wrap break-words rounded-xl border border-white/55 bg-white/40 p-4 font-mono text-xs text-slate-700 backdrop-blur",
        className
      )}
      {...props}
    >
      {children}
    </pre>
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-4 border-white/55", className)} {...props} />
  ),
  table: ({ className, children, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table className={cn("border-collapse w-full", className)} {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ className, children, ...props }) => (
    <th
      className={cn(
        "border border-white/55 bg-white/50 px-3 py-2 text-left font-semibold text-slate-900",
        className
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }) => (
    <td
      className={cn("border border-white/55 bg-white/20 px-3 py-2 text-slate-700", className)}
      {...props}
    >
      {children}
    </td>
  ),
};

export const humanMdComponents: Components = {
  ...mdComponents,
  a: ({ className, children, href, ...props }) => (
    <a
      className={cn("underline underline-offset-4 hover:text-teal-200 transition-colors", className)}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      {...props}
    >
      {children}
    </a>
  ),
};
