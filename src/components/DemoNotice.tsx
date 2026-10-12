export const DEMO_NOTICE_TEXT = 'Design preview · No blockchain connected';
export const LOCAL_NOTICE_TEXT = 'Local blockchain · Anvil';
/** Public build (`__PUBLIC_BUILD__`) only: replaces the design preview notice. */
export const PUBLIC_NOTICE_TEXT = 'Interactive demo · No blockchain transaction is sent.';

export interface DemoNoticeProps {
  /** Demo (design preview) or the Local chain (Anvil) mode. */
  mode?: 'demo' | 'local';
}

/** Persistent mode notice. App renders it once, under the header, on every view. */
export function DemoNotice({ mode = 'demo' }: DemoNoticeProps) {
  const text = __PUBLIC_BUILD__ ? PUBLIC_NOTICE_TEXT : mode === 'local' ? LOCAL_NOTICE_TEXT : DEMO_NOTICE_TEXT;
  return (
    <div className="demo-notice">
      <p className="container demo-notice__text">{text}</p>
    </div>
  );
}
