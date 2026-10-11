import { TEMPLATES } from "../lib/tx";

interface Props {
  value: string;
  disabled: boolean;
  signLabel: string;
  onChange: (v: string) => void;
  onSign: () => void;
}

export function TxEditor({ value, disabled, signLabel, onChange, onSign }: Props) {
  return (
    <section className="card">
      <h2>3. Transaction</h2>
      <div className="row wrap">
        {Object.keys(TEMPLATES).map((name) => (
          <button
            key={name}
            type="button"
            className="small"
            onClick={() => onChange(JSON.stringify(TEMPLATES[name], null, 2))}
          >
            {name}
          </button>
        ))}
      </div>
      <textarea
        spellCheck={false}
        rows={10}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="muted">
        Account is filled in from the connected wallet. Sequence, Fee and
        LastLedgerSequence are autofilled from the selected network.
      </p>
      <button type="button" className="primary" disabled={disabled} onClick={onSign}>
        {signLabel}
      </button>
    </section>
  );
}
