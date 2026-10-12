import { Badge, ConfigProvider, Segmented, Space, Tooltip, theme } from "antd";
import { useId } from "react";
import { NETWORK_NAMES } from "../lib/networkStore";
import type { NetworkId } from "../lib/networks";

const ORDER: NetworkId[] = ["testnet", "devnet", "mainnet"];

interface Props {
  value: NetworkId;
  onChange: (id: NetworkId) => void;
  disabled?: boolean;
  // Shown as a tooltip and read out by screen readers while disabled.
  disabledReason?: string;
}

// The global network switch. Choosing takes effect immediately; mainnet is marked in red,
// not confirmed.
export function NetworkSwitch({ value, onChange, disabled = false, disabledReason }: Props) {
  const { token } = theme.useToken();
  const whyId = useId();
  const dot: Record<NetworkId, string> = {
    testnet: token.colorSuccess,
    devnet: token.colorInfo,
    mainnet: token.colorError,
  };

  const options = ORDER.map((id) => ({
    value: id,
    label: (
      <Space size={6}>
        <Badge color={id === "mainnet" && value === id ? token.colorWhite : dot[id]} />
        <span>{NETWORK_NAMES[id]}</span>
      </Space>
    ),
  }));

  const segmented = (
    <ConfigProvider
      theme={{
        components:
          value === "mainnet"
            ? {
                Segmented: {
                  itemSelectedBg: token.colorError,
                  itemSelectedColor: token.colorWhite,
                },
              }
            : {},
      }}
    >
      <Segmented<NetworkId>
        aria-label="Network"
        aria-describedby={disabled && disabledReason ? whyId : undefined}
        options={options}
        value={value}
        disabled={disabled}
        onChange={(id) => {
          if (id !== value) onChange(id);
        }}
      />
    </ConfigProvider>
  );

  if (!disabled || !disabledReason) return segmented;
  return (
    <>
      <Tooltip title={disabledReason}>
        <span>{segmented}</span>
      </Tooltip>
      <span id={whyId} className="sr-only">
        {disabledReason}
      </span>
    </>
  );
}
