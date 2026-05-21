import { Navigate, Route, Routes } from "react-router-dom";
import { MachineProvider } from "./machineContext";
import Layout from "./Layout";
import ControllerView from "./views/Controller";
import OffsetsView from "./views/Offsets";
import ParamsView from "./views/Params";
import MdiView from "./views/Mdi";
import DiagnosticsView from "./views/Diagnostics";

export default function App() {
  return (
    <MachineProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/controller" replace />} />
          <Route path="controller" element={<ControllerView />} />
          <Route path="offsets" element={<OffsetsView />} />
          <Route path="params" element={<ParamsView />} />
          <Route path="mdi" element={<MdiView />} />
          <Route path="diagnostics" element={<DiagnosticsView />} />
        </Route>
      </Routes>
    </MachineProvider>
  );
}
