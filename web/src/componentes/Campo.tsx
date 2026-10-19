import { useId, type ReactNode } from "react";

interface Props {
  etiqueta: string;
  error?: string | null;
  ayuda?: ReactNode;
  children: (id: string, describe: string | undefined) => ReactNode;
  className?: string;
}

export function Campo({ etiqueta, error, ayuda, children, className }: Props) {
  const id = useId();
  const idAyuda = `${id}-ayuda`;
  const idError = `${id}-error`;
  const describe = [error ? idError : null, ayuda ? idAyuda : null].filter(Boolean).join(" ") || undefined;
  return (
    <label className={`campo${error ? " con-error" : ""}${className ? ` ${className}` : ""}`} htmlFor={id}>
      <span>{etiqueta}</span>
      {children(id, describe)}
      {error ? (
        <span className="error-campo" id={idError}>
          {error}
        </span>
      ) : null}
      {ayuda ? (
        <span className="ayuda" id={idAyuda}>
          {ayuda}
        </span>
      ) : null}
    </label>
  );
}
