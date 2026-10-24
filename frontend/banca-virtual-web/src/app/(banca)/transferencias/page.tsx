'use client';

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { DownloadIcon } from '@/components/icons';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, SelectField } from '@/components/ui/Field';
import { PageLoader } from '@/components/ui/Spinner';
import type { Beneficiario, Frecuencia, Programada } from '@/interfaces/banca.interface';
import type { Cuenta, CuentaDestino } from '@/interfaces/cuenta.interface';
import type { ComprobanteTransferencia, EnvioPendienteCelular, PendienteCelular, TransferenciaHistorial } from '@/interfaces/transferencia.interface';
import { errorMessage } from '@/lib/api';
import { TIPO_CUENTA_LABEL, formatCuenta, formatDate, formatFecha, formatMoney, hoyGT } from '@/lib/format';
import { descargarComprobante } from '@/lib/pdf';
import { beneficiariosService, estadoCuentaService, programadasService } from '@/services/banca.service';
import { cuentasService } from '@/services/cuentas/cuentas.service';
import { transferenciasService } from '@/services/transferencias/transferencias.service';

type Paso = 'formulario' | 'confirmar' | 'listo';
type Pestana = 'nueva' | 'programadas' | 'beneficiarios';
type Modo = 'propia' | 'beneficiario' | 'celular' | 'otra';

const FRECUENCIA_LABEL: Record<Frecuencia, string> = {
  UNICA: 'Una sola vez',
  SEMANAL: 'Cada semana',
  QUINCENAL: 'Cada 15 días',
  MENSUAL: 'Cada mes',
};

export default function TransferenciasPage() {
  const [pestana, setPestana] = useState<Pestana>('nueva');
  const [cuentas, setCuentas] = useState<Cuenta[] | null>(null);
  const [beneficiarios, setBeneficiarios] = useState<Beneficiario[]>([]);
  const [programadas, setProgramadas] = useState<Programada[]>([]);
  const [historial, setHistorial] = useState<TransferenciaHistorial[]>([]);
  const [pendientesCel, setPendientesCel] = useState<PendienteCelular[]>([]);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');

  const cargar = useCallback(async () => {
    try {
      const [c, h, b, p, pc] = await Promise.all([
        cuentasService.listar(),
        transferenciasService.historial(1, 8),
        beneficiariosService.listar(),
        programadasService.listar(),
        transferenciasService.pendientesCelular().catch(() => [] as PendienteCelular[]),
      ]);
      setCuentas(c);
      setHistorial(h.items);
      setBeneficiarios(b);
      setProgramadas(p);
      setPendientesCel(pc);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (!cuentas && !error) return <PageLoader />;

  const activas = programadas.filter((p) => p.estado === 'ACTIVA' || p.estado === 'PAUSADA').length;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5">
      <div role="tablist" className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-card p-1">
        <Tab activo={pestana === 'nueva'} onClick={() => setPestana('nueva')}>
          Nueva transferencia
        </Tab>
        <Tab activo={pestana === 'programadas'} onClick={() => setPestana('programadas')}>
          Programadas{activas > 0 && <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 text-xs text-brand-600">{activas}</span>}
        </Tab>
        <Tab activo={pestana === 'beneficiarios'} onClick={() => setPestana('beneficiarios')}>
          Beneficiarios{beneficiarios.length > 0 && <span className="ml-1.5 rounded-full bg-brand-50 px-1.5 text-xs text-brand-600">{beneficiarios.length}</span>}
        </Tab>
      </div>

      {error && <Alert tone="error">{error}</Alert>}
      {aviso && <Alert tone="success">{aviso}</Alert>}

      {pestana === 'nueva' && cuentas && (
        <NuevaTransferencia
          cuentas={cuentas}
          beneficiarios={beneficiarios}
          onCambio={cargar}
          onProgramada={() => {
            setAviso('Transferencia programada. Puedes verla en la pestaña «Programadas».');
            setPestana('programadas');
            setTimeout(() => setAviso(''), 5000);
          }}
          onError={setError}
        />
      )}

      {pestana === 'programadas' && <ListaProgramadas programadas={programadas} onCambio={cargar} onError={setError} />}

      {pestana === 'beneficiarios' && <PanelBeneficiarios beneficiarios={beneficiarios} onCambio={cargar} onError={setError} />}

      {pestana === 'nueva' && <PendientesCelular items={pendientesCel} onCambio={cargar} onError={setError} />}

      {pestana === 'nueva' && <Historial historial={historial} onError={setError} />}
    </div>
  );
}

// ---------------------------------------------------------------- nueva transferencia

function NuevaTransferencia({
  cuentas,
  beneficiarios,
  onCambio,
  onProgramada,
  onError,
}: {
  cuentas: Cuenta[];
  beneficiarios: Beneficiario[];
  onCambio: () => Promise<void>;
  onProgramada: () => void;
  onError: (m: string) => void;
}) {
  const origenes = useMemo(() => cuentas.filter((c) => c.estado === 'ACTIVA' && c.tipo !== 'PLAZO_FIJO'), [cuentas]);
  const [paso, setPaso] = useState<Paso>('formulario');
  const [trabajando, setTrabajando] = useState(false);
  const [origenId, setOrigenId] = useState(origenes[0]?.id ?? '');
  const [modo, setModo] = useState<Modo>('otra');
  const [propiaId, setPropiaId] = useState('');
  const [benefId, setBenefId] = useState('');
  const [numeroLibre, setNumeroLibre] = useState('');
  const [celular, setCelular] = useState('');
  const [celDestino, setCelDestino] = useState<CuentaDestino | null>(null);
  const [buscandoCel, setBuscandoCel] = useState(false);
  const [errorCel, setErrorCel] = useState('');
  const [monto, setMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [programar, setProgramar] = useState(false);
  const [frecuencia, setFrecuencia] = useState<Frecuencia>('UNICA');
  const [fecha, setFecha] = useState(hoyGT(1));
  const [hora, setHora] = useState('08:00');
  const [destino, setDestino] = useState<CuentaDestino | null>(null);
  const [comprobante, setComprobante] = useState<ComprobanteTransferencia | null>(null);
  const [aliasNuevo, setAliasNuevo] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [modoUsado, setModoUsado] = useState<Modo>('otra');
  const [celularUsado, setCelularUsado] = useState('');
  const [bajando, setBajando] = useState(false);
  const [envioPendiente, setEnvioPendiente] = useState<EnvioPendienteCelular | null>(null);

  const origen = origenes.find((c) => c.id === origenId);
  const propias = origenes.filter((c) => c.id !== origenId);

  const numeroDestino = modo === 'propia' ? (propias.find((c) => c.id === propiaId)?.numero ?? '') : modo === 'beneficiario' ? (beneficiarios.find((b) => b.id === benefId)?.cuentaNumero ?? '') : modo === 'celular' ? (celDestino?.numero ?? '') : numeroLibre;

  const montoNum = Number(monto);
  // Celular sin cuenta todavía: el envío queda pendiente de reclamar (no se puede programar)
  const pendienteCel = modo === 'celular' && !!celDestino && celDestino.registrado === false;
  const numeroOk = pendienteCel ? !programar : /^\d{10}$/.test(numeroDestino);
  const montoOk = montoNum > 0 && (!origen || programar || montoNum <= Number(origen.saldo));
  const mismaCuenta = !!origen && origen.numero === numeroDestino;
  const fechaOk = !programar || fecha >= hoyGT();
  const ahoraGT = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const horaOk = !programar || (/^\d{2}:\d{2}$/.test(hora) && !(fecha === hoyGT() && hora < ahoraGT));

  useEffect(() => {
    if (!origenId && origenes[0]) setOrigenId(origenes[0].id);
  }, [origenes, origenId]);
  useEffect(() => {
    if (modo === 'propia' && !propias.some((c) => c.id === propiaId)) setPropiaId(propias[0]?.id ?? '');
  }, [modo, propias, propiaId]);
  useEffect(() => {
    if (modo === 'beneficiario' && !beneficiarios.some((b) => b.id === benefId)) setBenefId(beneficiarios[0]?.id ?? '');
  }, [modo, beneficiarios, benefId]);

  // Transferencia móvil: al completar el celular se muestra el titular (apellido enmascarado) y se resuelve su cuenta
  useEffect(() => {
    setCelDestino(null);
    setErrorCel('');
    if (modo !== 'celular' || !/^[2-7]\d{7}$/.test(celular)) return;
    let vigente = true;
    setBuscandoCel(true);
    cuentasService
      .validarCelular(celular)
      .then((d) => vigente && setCelDestino(d))
      .catch((e) => vigente && setErrorCel(errorMessage(e)))
      .finally(() => vigente && setBuscandoCel(false));
    return () => {
      vigente = false;
    };
  }, [modo, celular]);

  async function continuar(e: FormEvent) {
    e.preventDefault();
    onError('');
    setTrabajando(true);
    try {
      if (pendienteCel) {
        setDestino(celDestino);
        setPaso('confirmar');
        return;
      }
      setDestino(await cuentasService.validarDestino(numeroDestino));
      if (programar) {
        await programadasService.crear({
          cuentaOrigenId: origenId,
          cuentaDestinoNumero: numeroDestino,
          monto: montoNum,
          descripcion: descripcion.trim() || undefined,
          frecuencia,
          fecha,
          hora,
        });
        await onCambio();
        reiniciar();
        onProgramada();
      } else {
        setPaso('confirmar'); // se muestra a quién se enviará antes de confirmar
      }
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setTrabajando(false);
    }
  }

  async function confirmar() {
    if (!origen) return;
    onError('');
    setTrabajando(true);
    try {
      // Transferencia móvil: a un celular escrito o a un beneficiario guardado por celular
      const telMovil = modo === 'celular' ? celular : modo === 'beneficiario' ? (beneficiarios.find((b) => b.id === benefId)?.telefono ?? '') : '';
      if (telMovil) {
        const r = await transferenciasService.crearCelular({
          cuentaOrigenId: origen.id,
          telefono: telMovil,
          monto: montoNum,
          descripcion: descripcion.trim() || undefined,
        });
        if (r.pendiente) {
          setEnvioPendiente(r);
          setPaso('listo');
          await onCambio();
          return;
        }
        const { pendiente: _p, ...comp } = r;
        setComprobante(comp);
        setModoUsado(modo);
        setCelularUsado(telMovil);
        setAliasNuevo(destino?.titular.split(' ')[0] ?? '');
        setGuardado(false);
        setPaso('listo');
        await onCambio();
        return;
      }
      const c = await transferenciasService.crear({
        cuentaOrigenId: origen.id,
        cuentaDestinoNumero: numeroDestino,
        monto: montoNum,
        descripcion: descripcion.trim() || undefined,
      });
      setComprobante(c);
      setModoUsado(modo);
      setCelularUsado(celular);
      setAliasNuevo(destino?.titular.split(' ')[0] ?? '');
      setGuardado(false);
      setPaso('listo');
      await onCambio();
    } catch (err) {
      onError(errorMessage(err));
      setPaso('formulario');
    } finally {
      setTrabajando(false);
    }
  }

  function reiniciar() {
    setPaso('formulario');
    setNumeroLibre('');
    setCelular('');
    setDestino(null);
    setMonto('');
    setDescripcion('');
    setComprobante(null);
    setEnvioPendiente(null);
    setProgramar(false);
    setFrecuencia('UNICA');
    onError('');
  }

  async function guardarBeneficiario() {
    if (!comprobante) return;
    try {
      if (modoUsado === 'celular' && celularUsado) await beneficiariosService.crearPorCelular(aliasNuevo.trim(), celularUsado);
      else await beneficiariosService.crear(aliasNuevo.trim(), comprobante.cuentaDestino);
      setGuardado(true);
      await onCambio();
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  async function bajarPdf() {
    if (!comprobante) return;
    setBajando(true);
    try {
      await descargarComprobante({ tipo: 'TRANSFERENCIA', c: await estadoCuentaService.comprobante(comprobante.referencia) });
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBajando(false);
    }
  }

  const esPropia = !!comprobante && cuentas.some((c) => c.numero === comprobante.cuentaDestino);
  const yaBenef = !!comprobante && (beneficiarios.some((b) => b.cuentaNumero === comprobante.cuentaDestino) || (modoUsado === 'celular' && beneficiarios.some((b) => b.telefono === celularUsado)));

  if (origenes.length === 0) return <Alert tone="info">Necesitas una cuenta activa (monetaria o de ahorro) para transferir.</Alert>;

  if (paso === 'confirmar' && origen && (destino || pendienteCel)) {
    return (
      <Card className="mx-auto w-full max-w-lg space-y-4">
        <h2 className="text-lg font-semibold">Confirma tu transferencia</h2>
        <dl className="space-y-3 text-sm">
          <Fila k="Desde" v={`${origen.alias ?? TIPO_CUENTA_LABEL[origen.tipo]} · ${formatCuenta(origen.numero)}`} />
          <Fila k="Para" v={pendienteCel ? `Celular ${celular.slice(0, 4)} ${celular.slice(4)} (aún no registrado)` : modo === 'celular' ? `${destino!.titular} · Celular ${celular.slice(0, 4)} ${celular.slice(4)}` : `${destino!.titular} · ${formatCuenta(destino!.numero)}`} />
          <Fila k="Monto" v={formatMoney(montoNum, origen.moneda)} fuerte />
          {descripcion.trim() && <Fila k="Descripción" v={descripcion.trim()} />}
        </dl>
        {pendienteCel ? (
          <Alert tone="info">
            Ese celular todavía no está en CP BancaVirtual. Tu dinero sale de tu cuenta y queda retenido: se entrega apenas la persona registre su número. Si nadie lo hace en 7 días, te lo devolvemos. Puedes cancelarlo cuando quieras mientras siga pendiente.
          </Alert>
        ) : (
          <p className="text-xs text-muted">Verifica que el titular sea quien esperas: las transferencias no se pueden deshacer.</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" full onClick={() => setPaso('formulario')} disabled={trabajando}>
            Volver
          </Button>
          <Button full onClick={confirmar} loading={trabajando}>
            Confirmar y enviar
          </Button>
        </div>
      </Card>
    );
  }

  if (paso === 'listo' && envioPendiente) {
    return (
      <Card className="mx-auto w-full max-w-lg space-y-4">
        <div className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-brand-50 text-2xl text-brand-600" aria-hidden="true">
            ⏳
          </span>
          <h2 className="mt-3 text-lg font-semibold">Envío en espera</h2>
          <p className="tabular text-3xl font-bold">{formatMoney(envioPendiente.monto, envioPendiente.moneda)}</p>
        </div>
        <dl className="space-y-3 text-sm">
          <Fila k="Referencia" v={envioPendiente.referencia} />
          <Fila k="Para" v={`Celular ${envioPendiente.telefono.slice(0, 4)} ${envioPendiente.telefono.slice(4)}`} />
          <Fila k="Se devuelve el" v={formatDate(envioPendiente.expiraEn)} />
          <Fila k="Tu nuevo saldo" v={formatMoney(envioPendiente.saldoOrigenDespues, envioPendiente.moneda)} />
        </dl>
        <p className="text-xs text-muted">Avísale a esa persona que se registre con ese número en CP BancaVirtual. Apenas lo haga, recibe el dinero y te avisamos. Puedes cancelarlo desde «Envíos pendientes».</p>
        <Button full onClick={reiniciar}>
          Hacer otra transferencia
        </Button>
      </Card>
    );
  }

  if (paso === 'listo' && comprobante) {
    return (
      <Card className="mx-auto w-full max-w-lg space-y-4">
        <div className="text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-verde-bg text-2xl text-verde" aria-hidden="true">
            ✓
          </span>
          <h2 className="mt-3 text-lg font-semibold">Transferencia realizada</h2>
          <p className="tabular text-3xl font-bold">{formatMoney(comprobante.monto, comprobante.moneda)}</p>
        </div>
        <dl className="space-y-3 text-sm">
          <Fila k="Referencia" v={comprobante.referencia} />
          <Fila k="Desde" v={formatCuenta(comprobante.cuentaOrigen)} />
          <Fila k="Para" v={`${destino?.titular ?? ''} · ${formatCuenta(comprobante.cuentaDestino)}`} />
          <Fila k="Fecha" v={formatDate(comprobante.fecha)} />
          <Fila k="Tu nuevo saldo" v={formatMoney(comprobante.saldoOrigenDespues, comprobante.moneda)} />
        </dl>

        {!esPropia && !yaBenef && !guardado && (
          <div className="rounded-xl border border-line bg-input p-4">
            <p className="text-sm font-semibold">¿Guardar a {destino?.titular} como beneficiario?</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Alias" maxLength={60} value={aliasNuevo} onChange={(e) => setAliasNuevo(e.target.value)} />
              <Button variant="secondary" onClick={guardarBeneficiario} disabled={!aliasNuevo.trim()}>
                Guardar
              </Button>
            </div>
          </div>
        )}
        {guardado && <Alert tone="success">Beneficiario guardado.</Alert>}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" full onClick={bajarPdf} loading={bajando}>
            <DownloadIcon width={18} height={18} /> Descargar comprobante
          </Button>
          <Button full onClick={reiniciar}>
            Hacer otra transferencia
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-lg !p-5">
      <form onSubmit={continuar} className="space-y-3" noValidate>
        <SelectField
          className="!min-h-10 !py-2 text-sm"
          label="Desde la cuenta"
          value={origenId}
          onChange={(e) => setOrigenId(e.target.value)}
          options={origenes.map((c) => ({
            value: c.id,
            label: `${c.alias ?? TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)} · ${formatMoney(c.saldo, c.moneda)}`,
          }))}
        />

        <div>
          <p className="block text-sm font-semibold">Para</p>
          <div role="radiogroup" className="mt-1.5 grid grid-cols-4 gap-1 rounded-xl border border-line bg-input p-1">
            <Segmento activo={modo === 'propia'} onClick={() => setModo('propia')}>
              Mías
            </Segmento>
            <Segmento activo={modo === 'beneficiario'} onClick={() => setModo('beneficiario')}>
              Guardados
            </Segmento>
            <Segmento activo={modo === 'celular'} onClick={() => setModo('celular')}>
              Celular
            </Segmento>
            <Segmento activo={modo === 'otra'} onClick={() => setModo('otra')}>
              Cuenta
            </Segmento>
          </div>
        </div>

        {modo === 'propia' &&
          (propias.length === 0 ? (
            <Alert tone="info">No tienes otra cuenta propia. Abre una desde Inicio para transferir entre tus cuentas.</Alert>
          ) : (
            <SelectField
              label="Cuenta destino"
              value={propiaId}
              onChange={(e) => setPropiaId(e.target.value)}
              options={propias.map((c) => ({ value: c.id, label: `${c.alias ?? TIPO_CUENTA_LABEL[c.tipo]} · ${formatCuenta(c.numero)}` }))}
            />
          ))}

        {modo === 'beneficiario' &&
          (beneficiarios.length === 0 ? (
            <Alert tone="info">Aún no tienes beneficiarios. Guárdalos en la pestaña «Beneficiarios» o después de tu primera transferencia.</Alert>
          ) : (
            <SelectField
              label="Beneficiario"
              value={benefId}
              onChange={(e) => setBenefId(e.target.value)}
              options={beneficiarios.map((b) => ({ value: b.id, label: `${b.alias} · ${b.titular} · ${formatCuenta(b.cuentaNumero)}` }))}
            />
          ))}

        {modo === 'celular' && (
          <Field
            className="!min-h-10 !py-2"
            label="Número de celular"
            inputMode="numeric"
            maxLength={8}
            value={celular}
            onChange={(e) => setCelular(e.target.value.replace(/\D/g, ''))}
            placeholder="5555 1234"
            hint={buscandoCel ? 'Buscando…' : celDestino ? (celDestino.registrado === false ? 'Aún no está registrado: el dinero queda pendiente hasta 7 días' : `Titular: ${celDestino.titular}`) : 'Puedes enviar a cualquier celular de 8 dígitos'}
            error={errorCel || (mismaCuenta ? 'Ese celular corresponde a tu misma cuenta de origen' : pendienteCel && programar ? 'Para programar, el celular debe estar ya registrado' : undefined)}
          />
        )}

        {modo === 'otra' && (
          <Field
            className="!min-h-10 !py-2"
            label="Número de cuenta destino"
            inputMode="numeric"
            maxLength={10}
            value={numeroLibre}
            onChange={(e) => setNumeroLibre(e.target.value.replace(/\D/g, ''))}
            hint="10 dígitos, sin guiones"
            error={mismaCuenta ? 'La cuenta destino no puede ser la misma que la de origen' : undefined}
          />
        )}

        <div className="grid gap-3 sm:grid-cols-[9rem_1fr]">
        <Field
          className="!min-h-10 !py-2"
          label="Monto (Q)"
          type="number"
          inputMode="decimal"
          min={0.01}
          step="0.01"
          required
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
          error={origen && !programar && montoNum > Number(origen.saldo) ? 'El monto supera el saldo disponible' : undefined}
        />
        <Field className="!min-h-10 !py-2" label="Descripción (opcional)" maxLength={140} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Ej. Pago de almuerzo" />
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-line bg-input px-3.5 py-2.5">
          <input type="checkbox" checked={programar} onChange={(e) => setProgramar(e.target.checked)} className="h-4 w-4 accent-[#5b8dff]" />
          <span>
            <span className="block text-sm font-semibold">Programar esta transferencia</span>
            <span className="text-xs text-muted">Se envía sola en la fecha y hora que elijas.</span>
          </span>
        </label>

        {programar && (
          <div className="grid gap-3 sm:grid-cols-3">
            <SelectField
              className="!min-h-10 !py-2 text-sm"
              label="Frecuencia"
              value={frecuencia}
              onChange={(e) => setFrecuencia(e.target.value as Frecuencia)}
              options={(Object.keys(FRECUENCIA_LABEL) as Frecuencia[]).map((f) => ({ value: f, label: FRECUENCIA_LABEL[f] }))}
            />
            <Field
              className="!min-h-10 !py-2 text-sm"
              label={frecuencia === 'UNICA' ? 'Fecha de envío' : 'Primer envío'}
              type="date"
              min={hoyGT()}
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              error={!fechaOk ? 'La fecha no puede estar en el pasado' : undefined}
            />
            <Field
              className="!min-h-10 !py-2 text-sm"
              label="Hora de envío"
              type="time"
              value={hora}
              onChange={(e) => setHora(e.target.value)}
              hint="Hora de Guatemala"
              error={!horaOk ? (fecha === hoyGT() ? 'Esa hora ya pasó. Elige una posterior a la actual.' : 'Elige una hora válida') : undefined}
            />
          </div>
        )}

        <Button type="submit" full loading={trabajando} disabled={!origen || !numeroOk || !montoOk || mismaCuenta || !fechaOk || !horaOk || (modo === 'celular' && buscandoCel)}>
          {programar ? 'Programar transferencia' : 'Continuar'}
        </Button>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------- programadas

function ListaProgramadas({ programadas, onCambio, onError }: { programadas: Programada[]; onCambio: () => Promise<void>; onError: (m: string) => void }) {
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const visibles = programadas.filter((p) => p.estado === 'ACTIVA' || p.estado === 'PAUSADA' || p.ultimoError);

  async function accion(id: string, fn: (id: string) => Promise<unknown>) {
    onError('');
    setTrabajando(id);
    try {
      await fn(id);
      await onCambio();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setTrabajando(null);
    }
  }

  if (visibles.length === 0) {
    return (
      <Card className="text-center text-sm text-muted">
        No tienes transferencias programadas. Marca «Programar esta transferencia» al crear una nueva.
      </Card>
    );
  }

  return (
    <ul className="space-y-3">
      {visibles.map((p) => (
        <li key={p.id}>
          <Card className="space-y-3 !p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  {formatMoney(p.monto)} <span className="font-normal text-muted">a {formatCuenta(p.cuentaDestinoNumero)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted">
                  {FRECUENCIA_LABEL[p.frecuencia]} · desde {formatCuenta(p.cuentaOrigenNumero)} · {p.descripcion}
                </p>
              </div>
              <EstadoChip estado={p.estado} />
            </div>
            {(p.estado === 'ACTIVA' || p.estado === 'PAUSADA') && (
              <p className="text-sm">
                Próximo envío: <b>{formatFecha(p.proximaEjecucion)}{p.hora ? ` a las ${p.hora}` : ''}</b>
              </p>
            )}
            {p.ultimoError && <Alert tone="error">Último intento fallido: {p.ultimoError}</Alert>}
            {(p.estado === 'ACTIVA' || p.estado === 'PAUSADA') && (
              <div className="flex flex-wrap gap-2">
                {p.estado === 'ACTIVA' ? (
                  <Button variant="secondary" loading={trabajando === p.id} onClick={() => accion(p.id, programadasService.pausar)}>
                    Pausar
                  </Button>
                ) : (
                  <Button variant="secondary" loading={trabajando === p.id} onClick={() => accion(p.id, programadasService.reanudar)}>
                    Reanudar
                  </Button>
                )}
                <Button variant="danger" loading={trabajando === p.id} onClick={() => accion(p.id, programadasService.cancelar)}>
                  Cancelar
                </Button>
              </div>
            )}
          </Card>
        </li>
      ))}
    </ul>
  );
}

function EstadoChip({ estado }: { estado: Programada['estado'] }) {
  const estilos: Record<Programada['estado'], string> = {
    ACTIVA: 'bg-verde-bg text-verde',
    PAUSADA: 'bg-amarillo-bg text-amarillo',
    COMPLETADA: 'bg-brand-50 text-brand-600',
    CANCELADA: 'bg-rojo-bg text-rojo',
  };
  const etiqueta = { ACTIVA: 'Activa', PAUSADA: 'Pausada', COMPLETADA: 'Completada', CANCELADA: 'Cancelada' }[estado];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${estilos[estado]}`}>{etiqueta}</span>;
}

// ---------------------------------------------------------------- beneficiarios

function PanelBeneficiarios({ beneficiarios, onCambio, onError }: { beneficiarios: Beneficiario[]; onCambio: () => Promise<void>; onError: (m: string) => void }) {
  const [alias, setAlias] = useState('');
  const [tipo, setTipo] = useState<'celular' | 'cuenta'>('celular');
  const [numero, setNumero] = useState('');
  const [celular, setCelular] = useState('');
  const [titular, setTitular] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [errorCel, setErrorCel] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Al completar el celular se muestra a quién pertenece (apellido enmascarado), como en las apps bancarias
  useEffect(() => {
    setTitular(null);
    setErrorCel('');
    if (!/^[2-7]\d{7}$/.test(celular)) return;
    let vigente = true;
    setBuscando(true);
    cuentasService
      .validarCelular(celular)
      .then((d) => {
        if (!vigente) return;
        if (d.registrado === false) setErrorCel('Ese celular aún no está registrado. Envíale desde «Nueva transferencia → Celular»: lo recibe cuando se registre.');
        else setTitular(d.titular);
      })
      .catch((e) => vigente && setErrorCel(errorMessage(e)))
      .finally(() => vigente && setBuscando(false));
    return () => {
      vigente = false;
    };
  }, [celular]);

  const listo = tipo === 'celular' ? !!titular : /^\d{10}$/.test(numero);

  async function agregar(e: FormEvent) {
    e.preventDefault();
    onError('');
    setGuardando(true);
    try {
      if (tipo === 'celular') await beneficiariosService.crearPorCelular(alias.trim(), celular);
      else await beneficiariosService.crear(alias.trim(), numero);
      setAlias('');
      setNumero('');
      setCelular('');
      await onCambio();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: string) {
    onError('');
    try {
      await beneficiariosService.eliminar(id);
      await onCambio();
    } catch (err) {
      onError(errorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="font-semibold">Agregar beneficiario</h2>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-[10px] bg-input p-[3px] sm:max-w-xs" role="radiogroup" aria-label="Agregar por">
          {([['celular', 'Por celular'], ['cuenta', 'Por cuenta']] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={tipo === v} onClick={() => setTipo(v)} className={`rounded-[8px] px-3 py-1.5 text-sm font-semibold transition ${tipo === v ? 'bg-card text-ink shadow' : 'text-muted'}`}>
              {l}
            </button>
          ))}
        </div>
        <form onSubmit={agregar} className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Alias" maxLength={60} required value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="Ej. Mamá" />
          {tipo === 'celular' ? (
            <Field
              label="Número de celular"
              inputMode="numeric"
              maxLength={8}
              required
              value={celular}
              onChange={(e) => setCelular(e.target.value.replace(/\D/g, ''))}
              placeholder="5555 1234"
              hint={buscando ? 'Buscando…' : titular ? `Titular: ${titular}` : '8 dígitos'}
              error={errorCel || undefined}
            />
          ) : (
            <Field label="Número de cuenta" inputMode="numeric" maxLength={10} required value={numero} onChange={(e) => setNumero(e.target.value.replace(/\D/g, ''))} hint="10 dígitos" />
          )}
          <Button type="submit" loading={guardando} disabled={!alias.trim() || !listo}>
            Guardar
          </Button>
        </form>
      </Card>

      {beneficiarios.length === 0 ? (
        <Card className="text-center text-sm text-muted">Aún no tienes beneficiarios guardados.</Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {beneficiarios.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-4 px-4 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-50 font-bold text-brand-600">{b.alias.charAt(0).toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{b.alias}</p>
                  <p className="truncate text-xs text-muted">
                    {b.titular} ·{' '}
                    {b.telefono ? (
                      <span className="tabular">Celular {b.telefono.slice(0, 4)} {b.telefono.slice(4)}</span>
                    ) : (
                      <span className="tabular">{formatCuenta(b.cuentaNumero)}</span>
                    )}
                  </p>
                </div>
              </div>
              <button onClick={() => quitar(b.id)} className="shrink-0 text-xs font-semibold text-rojo hover:underline">
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- envíos pendientes por celular

function PendientesCelular({ items, onCambio, onError }: { items: PendienteCelular[]; onCambio: () => Promise<void>; onError: (m: string) => void }) {
  const [trabajando, setTrabajando] = useState<string | null>(null);
  if (items.length === 0) return null;

  async function cancelar(id: string) {
    setTrabajando(id);
    onError('');
    try {
      await transferenciasService.cancelarPendiente(id);
      await onCambio();
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setTrabajando(null);
    }
  }

  const ESTADO: Record<PendienteCelular['estado'], string> = { PENDIENTE: 'En espera', RECLAMADA: 'Recibido', DEVUELTA: 'Devuelto', CANCELADA: 'Cancelado' };

  return (
    <Card className="!p-4">
      <h2 className="font-semibold">Envíos por celular</h2>
      <p className="mt-0.5 text-xs text-muted">Números que aún no estaban registrados: el dinero queda retenido hasta que se registren o se te devuelve a los 7 días.</p>
      <ul className="mt-3 divide-y divide-line">
        {items.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="tabular text-sm font-semibold">
                {formatMoney(p.monto, p.moneda)} · {p.telefono.slice(0, 4)} {p.telefono.slice(4)}
              </p>
              <p className="text-xs text-muted">
                {p.estado === 'PENDIENTE' ? `Vence ${formatDate(p.expiraEn)}` : `${ESTADO[p.estado]} ${p.resueltaEn ? formatDate(p.resueltaEn) : ''}`}
              </p>
            </div>
            {p.estado === 'PENDIENTE' ? (
              <button onClick={() => cancelar(p.id)} disabled={trabajando === p.id} className="shrink-0 text-xs font-semibold text-rojo hover:underline disabled:opacity-50">
                {trabajando === p.id ? 'Cancelando…' : 'Cancelar y recuperar'}
              </button>
            ) : (
              <span className="shrink-0 rounded-full bg-input px-2 py-0.5 text-xs font-semibold text-muted">{ESTADO[p.estado]}</span>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------------------------------------------------------------- historial

function Historial({ historial, onError }: { historial: TransferenciaHistorial[]; onError: (m: string) => void }) {
  const [bajando, setBajando] = useState<string | null>(null);

  async function bajar(ref: string) {
    setBajando(ref);
    try {
      await descargarComprobante({ tipo: 'TRANSFERENCIA', c: await estadoCuentaService.comprobante(ref) });
    } catch (err) {
      onError(errorMessage(err));
    } finally {
      setBajando(null);
    }
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Últimas transferencias</h2>
      {historial.length === 0 ? (
        <Card className="text-center text-sm text-muted">Aún no has enviado ni recibido transferencias.</Card>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
          {historial.map((t) => (
            <li key={t.id} className="flex items-start justify-between gap-4 px-4 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {t.direccion === 'ENVIADA' ? `Enviada a ${formatCuenta(t.cuentaDestino)}` : `Recibida de ${formatCuenta(t.cuentaOrigen)}`}
                </p>
                <p className="mt-0.5 truncate text-xs text-muted">
                  {formatDate(t.fecha)} · {t.referencia}
                </p>
                <button
                  onClick={() => bajar(t.referencia)}
                  disabled={bajando === t.referencia}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline disabled:opacity-50"
                >
                  <DownloadIcon width={13} height={13} /> {bajando === t.referencia ? 'Generando…' : 'Comprobante PDF'}
                </button>
              </div>
              <p className={`tabular shrink-0 text-sm font-semibold ${t.direccion === 'RECIBIDA' ? 'text-verde' : ''}`}>
                {t.direccion === 'RECIBIDA' ? '+' : '−'}
                {formatMoney(t.monto, t.moneda)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- piezas

function Tab({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      role="tab"
      aria-selected={activo}
      onClick={onClick}
      className={`shrink-0 grow rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${activo ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function Segmento({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activo}
      onClick={onClick}
      className={`rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${activo ? 'bg-brand-600 text-white' : 'text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  );
}

function Fila({ k, v, fuerte = false }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className={`text-right ${fuerte ? 'tabular text-base font-bold' : 'font-medium'}`}>{v}</dd>
    </div>
  );
}
