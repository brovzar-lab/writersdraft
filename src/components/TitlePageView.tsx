/** Editable title page rendered like the printed page. */
import { useScriptStore } from "../stores/scriptStore";

export function TitlePageView() {
  const tp = useScriptStore((s) => s.script.titlePage);
  const setTitlePage = useScriptStore((s) => s.setTitlePage);

  const field = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    className = "",
  ) => (
    <input
      className={`bg-transparent text-center font-screenplay outline-none placeholder:text-ink-3/60 ${className}`}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );

  return (
    <div className="flex justify-center py-8">
      <div className="script-page paper-shadow rounded-[3px] border border-line/60 bg-surface flex flex-col items-center text-ink">
        <div className="mt-[2.5in] flex flex-col items-center gap-6 w-full">
          {field(
            tp.title,
            (v) => setTitlePage({ title: v }),
            "TITLE",
            "uppercase text-base w-4/5",
          )}
          <span className="font-screenplay">written by</span>
          {field(
            tp.author,
            (v) => setTitlePage({ author: v }),
            "Author",
            "w-3/5",
          )}
          {field(
            tp.draftDate,
            (v) => setTitlePage({ draftDate: v }),
            "Draft date",
            "w-3/5 text-sm",
          )}
        </div>
        <div className="mt-auto mb-2 w-full">
          <textarea
            className="w-1/2 resize-none bg-transparent font-screenplay text-sm outline-none placeholder:text-ink-3/60"
            rows={3}
            value={tp.contact}
            placeholder={"Contact\naddress / email"}
            onChange={(e) => setTitlePage({ contact: e.target.value })}
          />
        </div>
      </div>
    </div>
  );
}
