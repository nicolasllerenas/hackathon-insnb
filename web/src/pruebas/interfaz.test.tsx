import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { describe, expect, it } from "vitest";
import { ProveedorAvisos } from "../componentes/Avisos";
import Consola from "../consola/Consola";
import { ProveedorDatos } from "../datos/contexto";
import { AppMichi } from "../michi/AppMichi";

function conProveedores(ui: React.ReactNode, ruta = "/insn") {
  return render(
    <ProveedorDatos>
      <ProveedorAvisos>
        <MemoryRouter initialEntries={[ruta]}>
          <Routes>
            <Route path="/insn/*" element={ui} />
            <Route path="/michi" element={ui} />
          </Routes>
        </MemoryRouter>
      </ProveedorAvisos>
    </ProveedorDatos>,
  );
}

describe("consola clínica", () => {
  it("siembra la demostración y ordena el tablero por urgencia", async () => {
    conProveedores(<Consola />);
    const rejilla = await screen.findByRole("heading", { name: "Tablero de seguimiento" }, { timeout: 10_000 });
    expect(rejilla).toBeTruthy();
    await waitFor(() => expect(document.querySelectorAll(".tarjeta-paciente").length).toBe(6), { timeout: 10_000 });
    const tarjetas = Array.from(document.querySelectorAll<HTMLElement>(".tarjeta-paciente"));
    expect(within(tarjetas[0] as HTMLElement).getByText("Mateo Ríos Paredes")).toBeTruthy();
    expect(tarjetas[0]?.className).toContain("priorizable");
    const kpis = document.getElementById("kpis") as HTMLElement;
    expect(within(kpis).getByText("◆ Priorizables").parentElement?.textContent).toContain("1");
  });

  it("abre la ficha con la referencia propuesta cuando la familia no puede viajar", async () => {
    conProveedores(<Consola />, "/insn/pacientes/pac-joaquin");
    expect(await screen.findByRole("heading", { name: "Joaquín Ccahuana Mamani" }, { timeout: 10_000 })).toBeTruthy();
    expect(document.getElementById("franjaSilencio")).not.toBeNull();
    expect(screen.getAllByText(/Hospital Regional|Antonio Lorena|Cusco/).length).toBeGreaterThan(0);
  });
});

describe("app del michi", () => {
  it("se vincula con el código del hospital y muestra la agenda real", async () => {
    const usuario = userEvent.setup();
    conProveedores(<AppMichi />, "/michi");
    const campo = await screen.findByPlaceholderText("XXXX-XXXX-XXXX", undefined, { timeout: 10_000 });
    await usuario.type(campo, "3f7a21c00a11");
    await usuario.click(screen.getByRole("button", { name: "¡Vamos!" }));
    await waitFor(() => expect(screen.getByText("Michi de Ana Lucía")).toBeTruthy(), { timeout: 10_000 });
    await usuario.click(screen.getByRole("button", { name: /Agenda/ }));
    expect(await screen.findByText(/El michi maúlla entre las/)).toBeTruthy();
    expect(screen.getAllByText("Control con Hematología").length).toBeGreaterThan(0);
  });

  it("rechaza un código que no existe sin vincular", async () => {
    const usuario = userEvent.setup();
    conProveedores(<AppMichi />, "/michi");
    const campo = await screen.findByPlaceholderText("XXXX-XXXX-XXXX", undefined, { timeout: 10_000 });
    await usuario.type(campo, "FFFFFFFFFFFF");
    await usuario.click(screen.getByRole("button", { name: "¡Vamos!" }));
    expect(await screen.findByText(/no corresponde a ningún michi/, undefined, { timeout: 10_000 })).toBeTruthy();
  });
});
