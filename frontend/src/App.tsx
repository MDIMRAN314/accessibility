import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import RequestForm from "@components/RequestForm";
import ReportView from "@pages/ReportView";
import RequestList from "@pages/RequestList";
import Header from "@components/Header";
import styles from "./App.module.scss";

function App(): JSX.Element {
  return (
    <Router>
      <div className={styles.app}>
        <Header />
        <main className={styles.mainContent}>
          <Routes>
            <Route path="/" element={<RequestForm />} />
            <Route path="/requests" element={<RequestList />} />
            <Route path="/report/:reportId" element={<ReportView />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
