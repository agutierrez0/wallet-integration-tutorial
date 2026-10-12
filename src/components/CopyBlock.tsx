import { Typography, theme } from "antd";

interface Props {
  label: string;
  value: string;
}

// A labelled, scrollable monospace block with a copy button.
export function CopyBlock({ label, value }: Props) {
  const { token } = theme.useToken();
  return (
    <div>
      <Typography.Text type="secondary">{label}</Typography.Text>
      <div
        style={{
          marginTop: token.marginXXS,
          padding: `${token.paddingXS}px ${token.paddingSM}px`,
          border: `1px solid ${token.colorBorderSecondary}`,
          borderRadius: token.borderRadius,
          background: token.colorFillQuaternary,
          maxHeight: 220,
          overflow: "auto",
          display: "flex",
          gap: token.marginXS,
          alignItems: "flex-start",
        }}
      >
        <pre
          style={{
            margin: 0,
            flex: 1,
            minWidth: 0,
            fontFamily: token.fontFamilyCode,
            fontSize: token.fontSizeSM,
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}
        >
          {value}
        </pre>
        <Typography.Text copyable={{ text: value, tooltips: false }} />
      </div>
    </div>
  );
}
