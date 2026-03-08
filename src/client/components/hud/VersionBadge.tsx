import { APP_VERSION, BUILD_DATE } from '../../version';
import styles from './VersionBadge.module.css';

export function VersionBadge() {
  return (
    <div className={styles.badge}>
      <div>Alpha {APP_VERSION} ({BUILD_DATE})</div>
      <div>Created by Robin &ldquo;Crazz&rdquo; Aleman</div>
    </div>
  );
}
