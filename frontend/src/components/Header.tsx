import { Link } from "react-router-dom";
import styles from "@styles/Header.module.scss";

function Header(): JSX.Element {
  return (
    <header className={styles.header}>
      <div className={styles.headerContainer}>
        <div className={styles.logo}>
          <h1>Accessibility Workbench</h1>
        </div>
        <nav className={styles.nav}>
          <Link to="/" className={styles.navLink}>
            New Test
          </Link>
          <Link to="/requests" className={styles.navLink}>
            Test History
          </Link>
        </nav>
      </div>
    </header>
  );
}

export default Header;
