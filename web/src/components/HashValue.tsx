import CopyButton from "./CopyButton";

/** A hash or address in mono, with a copy affordance. */
export default function HashValue({ value }: { value: string }) {
  return (
    <span className="hash-row">
      <code className="hash">{value}</code>
      <CopyButton text={value} />
    </span>
  );
}
