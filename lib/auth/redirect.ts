export function safeReturnPath(path: string | null) {
  return path && path.startsWith("/") && !path.startsWith("//") && !/[\u0000-\u0020\u007f\\]/.test(path) ? path : "/reports";
}
