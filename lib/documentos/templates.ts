// Plantillas de "documentos tipo" (mandatos, órdenes de venta/arriendo,
// personal shopper) que el ejecutivo rellena, imprime y firma.
//
// Este archivo NO importa @react-pdf/renderer para poder usarse también en
// el cliente (renderizar el formulario). El componente PDF
// (lib/pdf/documento-pdf.tsx) consume `buildDocBlocks()` con los valores del
// formulario y produce el PDF listo para imprimir y firmar.
//
// Datos de las sociedades tomados de los formatos oficiales:
//   - España: BENJAMÍN COUSIÑO PROPIEDADES S.L., CIF B19444561,
//     Calle Serrano 19 — Planta 4 Derecha, 28001 Madrid.
//     Representada por D. Benjamín Cousiño, Administrador Único.
//   - Chile: Benjamín Cousiño Propiedades SpA, RUT 77290154-2,
//     representada por doña Andrea Bonhomme.

export type Country = "es" | "cl";

export type DocFieldType = "text" | "date" | "number" | "textarea";

export type DocField = {
  key: string;
  label: string;
  placeholder?: string;
  type?: DocFieldType;
  /** Ocupa toda la fila del formulario (por defecto media). */
  full?: boolean;
  /** Prefijo mostrado en el PDF antes del valor (p.ej. "+56 "). */
  prefix?: string;
};

// Bloques que consume el componente PDF.
export type DocBlock =
  | { type: "paragraph"; text: string }
  | { type: "clause"; num: string; text: string }
  | { type: "heading"; text: string }
  | { type: "spacer" }
  | { type: "signatures"; columns: { lines: string[] }[] };

export type DocRole =
  | "ejecutivo"
  | "propietario"
  | "arrendador"
  | "comprador"
  | "arrendatario";

export type DocTemplate = {
  id: string;
  country: Country;
  category: "venta" | "alquiler" | "personal_shopper";
  name: string;
  subtitle: string;
  /** A quién va dirigido / quién firma. Se muestran como etiquetas. */
  roles: DocRole[];
  fields: DocField[];
  /** Construye el cuerpo del documento con los valores del formulario. */
  build: (v: Record<string, string>) => DocBlock[];
  /** Nota que aparece en el cliente (no se imprime). */
  reviewNote?: string;
};

// Devuelve el valor rellenado o una línea de subrayado para completar a mano
// cuando se imprime en blanco.
function f(v: Record<string, string>, key: string, blank = "________________"): string {
  const raw = (v[key] ?? "").trim();
  return raw.length ? raw : blank;
}

// ---------------------------------------------------------------------------
// CHILE — ORDEN DE VENTA (formato oficial provisto)
// ---------------------------------------------------------------------------
const ordenVentaCL: DocTemplate = {
  id: "cl-orden-venta",
  country: "cl",
  category: "venta",
  name: "Orden de Venta",
  subtitle: "Encargo de venta del propietario (Comitente) al Corredor.",
  roles: ["ejecutivo", "propietario"],
  fields: [
    { key: "ciudad", label: "Ciudad", placeholder: "Santiago" },
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "propietario_nombre", label: "Propietario (doña/don)", placeholder: "Nombre completo", full: true },
    { key: "propietario_rut", label: "RUT propietario", placeholder: "12.345.678-9" },
    { key: "propietario_email", label: "Correo electrónico", placeholder: "correo@dominio.cl" },
    { key: "propietario_cel", label: "Celular", placeholder: "9 1234 5678", prefix: "+56 " },
    { key: "inmueble_direccion", label: "Dirección del inmueble", placeholder: "Calle, número, depto.", full: true },
    { key: "comuna", label: "Comuna" },
    { key: "region", label: "Región" },
    { key: "precio_uf", label: "Precio de venta (UF)", type: "number", placeholder: "0" },
    { key: "banco_hipoteca", label: "Banco hipoteca actual", placeholder: "Opcional" },
    { key: "uf_hipoteca", label: "UF aprox. hipoteca", placeholder: "Opcional" },
  ],
  build: (v) => [
    {
      type: "paragraph",
      text:
        `En ${f(v, "ciudad")} a ${f(v, "fecha")}, doña/don ${f(v, "propietario_nombre")}, ` +
        `Rut: ${f(v, "propietario_rut")}, correo electrónico ${f(v, "propietario_email")}, ` +
        `Cel: +56 ${f(v, "propietario_cel")}, en su calidad de propietario del inmueble que se singulariza, ` +
        `en adelante denominado "EL COMITENTE", quien encarga a Benjamín Cousiño Propiedades SpA., ` +
        `rut 77290154-2, representada por doña Andrea Bonhomme, en adelante denominado "EL CORREDOR", ` +
        `quien, por el presente instrumento acepta que este último gestione y medie en la venta del inmueble ubicado en ` +
        `${f(v, "inmueble_direccion")}, Comuna de ${f(v, "comuna")}, Región ${f(v, "region")}, en los siguientes términos:`,
    },
    { type: "clause", num: "1", text: `PRECIO DE VENTA: U.F ${f(v, "precio_uf", "________")} (Unidades de Fomento)` },
    {
      type: "clause",
      num: "2",
      text:
        `PUBLICIDAD: "EL COMITENTE" autoriza la publicación de su propiedad en los sitios web y portales que ` +
        `"EL CORREDOR" estime conveniente. Para tales efectos "EL CORREDOR" está facultado para tomar fotografías ` +
        `del inmueble, cuyo uso será exclusivo de "EL CORREDOR".`,
    },
    {
      type: "clause",
      num: "3",
      text:
        `PLAZO DE VIGENCIA: Esta "Orden de Venta" tendrá un plazo de vigencia de 90 días corridos a contar de esta ` +
        `fecha, renovable automáticamente por períodos iguales y sucesivos de 90 días cada uno, salvo que alguna de ` +
        `las partes diere aviso escrito a la otra de su intención de no perseverar en la gestión de venta, con al menos ` +
        `treinta días de anticipación al vencimiento del respectivo período.`,
    },
    {
      type: "clause",
      num: "4",
      text:
        `COMISIÓN: "EL COMITENTE" pagará a "EL CORREDOR" una comisión ascendente al 2% más I.V.A. del precio final ` +
        `de la compraventa. La comisión se devengará al momento de la inscripción de la propiedad a nombre del comprador ` +
        `en el Conservador de Bienes Raíces. Para dar cumplimiento a esta obligación "EL COMITENTE" dejará al momento ` +
        `de la firma de la promesa de compraventa en poder de la Corredora de Propiedades un cheque nominativo, cruzado ` +
        `y sin fecha de giro a nombre de Benjamín Cousiño Propiedades SpA. "EL COMITENTE" pagará la comisión, aun cuando ` +
        `el negocio se convenga o formalice después de expirado el plazo de duración de esta orden, si el correspondiente ` +
        `comprador hubiese recibido de "EL CORREDOR" la Orden de Visita durante la vigencia del plazo establecido en el ` +
        `número tercero de esta Orden.`,
    },
    {
      type: "clause",
      num: "5",
      text:
        `EXCLUSIVIDAD: La presente orden de venta tendrá el carácter de NO EXCLUSIVO. En caso de exclusividad y mientras ` +
        `se encuentre vigente la presente Orden de Venta, sólo Benjamín Cousiño Propiedades SpA. podrá ofrecer en venta ` +
        `la propiedad a que se refiere este instrumento. Si la orden es exclusiva y "EL COMITENTE" gestiona el negocio ` +
        `por intermedio de otro corredor y vendiere o prometiere vender la propiedad durante la vigencia de esta orden, ` +
        `deberá pagar a Benjamín Cousiño Propiedades SpA., a título de multa, el 2% más IVA del precio de la compraventa, ` +
        `lo mismo ocurrirá si "EL COMITENTE", ya sea orden de venta exclusiva o no exclusiva, gestionase el negocio ` +
        `directamente con algún cliente enviado por Benjamín Cousiño Propiedades SpA. "EL COMITENTE" se hace responsable ` +
        `de la veracidad de los datos proporcionados a "EL CORREDOR", declarando que su propiedad tiene toda la ` +
        `documentación al día.`,
    },
    {
      type: "clause",
      num: "6",
      text:
        `RESPONSABILIDAD: "EL COMITENTE" asume la responsabilidad de entregar oportunamente todos los antecedentes ` +
        `legales y comerciales que sean necesarios para proceder al estudio de títulos. El costo de obtención de todos ` +
        `dichos antecedentes será de su cargo exclusivo, así como el saneamiento de los títulos de la propiedad en caso ` +
        `de que fuere necesario.`,
    },
    {
      type: "clause",
      num: "7",
      text:
        `ARBITRAJE: Cualquier duda o dificultad que surja entre las partes con motivo del presente contrato o de sus ` +
        `documentos complementarios o modificatorios, ya se refiera a su interpretación, cumplimiento, validez, ` +
        `terminación o cualquiera otra causa relacionada con él, se resolverá mediante arbitraje, conforme al Reglamento ` +
        `Procesal de Arbitraje vigente del Centro de Arbitrajes de la Cámara de Comercio de Santiago A. G., que formando ` +
        `parte integrante de esta cláusula, las partes declaran conocer y aceptar. Las partes confieren mandato especial ` +
        `irrevocable a la Cámara de Comercio de Santiago A.G. para que, a solicitud escrita de cualquiera de ellas, ` +
        `designe al árbitro arbitrador de entre los integrantes del cuerpo arbitral del Centro de Arbitrajes de esa Cámara. ` +
        `En contra de las resoluciones del arbitrador no procederá recurso alguno, por lo cual las partes vienen en ` +
        `renunciar expresamente a ellos. El árbitro queda especialmente facultado para resolver todo asunto relacionado ` +
        `con su competencia y/o jurisdicción.`,
    },
    {
      type: "clause",
      num: "8",
      text:
        `DOMICILIO: Para todos los efectos del presente Contrato las partes fijan su domicilio en la Ciudad y Comuna de Santiago.`,
    },
    {
      type: "clause",
      num: "9",
      text:
        `ANTECEDENTES: Banco Hipoteca Actual: ${f(v, "banco_hipoteca", "________________")}   ` +
        `UF aprox.: ${f(v, "uf_hipoteca", "____________")}`,
    },
    { type: "spacer" },
    {
      type: "paragraph",
      text:
        `Para constancia firman esta ORDEN DE VENTA en dos ejemplares del mismo tenor y fecha, quedando uno en poder de cada parte.`,
    },
    { type: "spacer" },
    {
      type: "signatures",
      columns: [
        { lines: ["Firma Comitente", f(v, "propietario_nombre", ""), f(v, "propietario_rut", "")] },
        { lines: ["Firma Corredor", "Benjamín Cousiño Propiedades SpA.", "Andrea Bonhomme"] },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// CHILE — ORDEN DE ARRIENDO (borrador espejo de la Orden de Venta)
// ---------------------------------------------------------------------------
const ordenArriendoCL: DocTemplate = {
  id: "cl-orden-arriendo",
  country: "cl",
  category: "alquiler",
  name: "Orden de Arriendo",
  subtitle: "Encargo de arriendo del propietario (Comitente) al Corredor.",
  roles: ["ejecutivo", "propietario"],
  reviewNote:
    "Borrador basado en el formato de Orden de Venta. Revisar comisión y condiciones antes de usar.",
  fields: [
    { key: "ciudad", label: "Ciudad", placeholder: "Santiago" },
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "propietario_nombre", label: "Propietario (doña/don)", placeholder: "Nombre completo", full: true },
    { key: "propietario_rut", label: "RUT propietario", placeholder: "12.345.678-9" },
    { key: "propietario_email", label: "Correo electrónico", placeholder: "correo@dominio.cl" },
    { key: "propietario_cel", label: "Celular", placeholder: "9 1234 5678", prefix: "+56 " },
    { key: "inmueble_direccion", label: "Dirección del inmueble", placeholder: "Calle, número, depto.", full: true },
    { key: "comuna", label: "Comuna" },
    { key: "region", label: "Región" },
    { key: "precio_arriendo", label: "Canon de arriendo mensual (UF)", type: "number", placeholder: "0" },
  ],
  build: (v) => [
    {
      type: "paragraph",
      text:
        `En ${f(v, "ciudad")} a ${f(v, "fecha")}, doña/don ${f(v, "propietario_nombre")}, ` +
        `Rut: ${f(v, "propietario_rut")}, correo electrónico ${f(v, "propietario_email")}, ` +
        `Cel: +56 ${f(v, "propietario_cel")}, en su calidad de propietario del inmueble que se singulariza, ` +
        `en adelante denominado "EL COMITENTE", quien encarga a Benjamín Cousiño Propiedades SpA., ` +
        `rut 77290154-2, representada por doña Andrea Bonhomme, en adelante denominado "EL CORREDOR", ` +
        `quien, por el presente instrumento acepta que este último gestione y medie en el arriendo del inmueble ubicado en ` +
        `${f(v, "inmueble_direccion")}, Comuna de ${f(v, "comuna")}, Región ${f(v, "region")}, en los siguientes términos:`,
    },
    { type: "clause", num: "1", text: `CANON DE ARRIENDO: U.F ${f(v, "precio_arriendo", "________")} mensuales (Unidades de Fomento).` },
    {
      type: "clause",
      num: "2",
      text:
        `PUBLICIDAD: "EL COMITENTE" autoriza la publicación de su propiedad en los sitios web y portales que ` +
        `"EL CORREDOR" estime conveniente, facultándolo para tomar fotografías del inmueble para uso exclusivo del CORREDOR.`,
    },
    {
      type: "clause",
      num: "3",
      text:
        `PLAZO DE VIGENCIA: Esta Orden de Arriendo tendrá un plazo de vigencia de 90 días corridos a contar de esta fecha, ` +
        `renovable automáticamente por períodos iguales, salvo aviso escrito de cualquiera de las partes con al menos ` +
        `treinta días de anticipación al vencimiento del respectivo período.`,
    },
    {
      type: "clause",
      num: "4",
      text:
        `COMISIÓN: "EL COMITENTE" pagará a "EL CORREDOR" una comisión equivalente al 50% del primer canon de arriendo más ` +
        `I.V.A., que se devengará al momento de la firma del contrato de arrendamiento. "EL COMITENTE" pagará la comisión ` +
        `aun cuando el negocio se formalice después de expirado el plazo de esta orden, si el arrendatario hubiese sido ` +
        `presentado por "EL CORREDOR" durante su vigencia.`,
    },
    {
      type: "clause",
      num: "5",
      text:
        `EXCLUSIVIDAD: La presente orden de arriendo tendrá el carácter de NO EXCLUSIVO, salvo pacto expreso en contrario. ` +
        `"EL COMITENTE" se hace responsable de la veracidad de los datos proporcionados, declarando que su propiedad tiene ` +
        `toda la documentación al día.`,
    },
    {
      type: "clause",
      num: "6",
      text:
        `RESPONSABILIDAD: "EL COMITENTE" asume la responsabilidad de entregar oportunamente los antecedentes legales y ` +
        `comerciales necesarios, siendo de su cargo exclusivo el costo de obtención de dichos antecedentes.`,
    },
    {
      type: "clause",
      num: "7",
      text:
        `ARBITRAJE: Cualquier duda o dificultad que surja entre las partes se resolverá mediante arbitraje conforme al ` +
        `Reglamento Procesal de Arbitraje vigente del Centro de Arbitrajes de la Cámara de Comercio de Santiago A. G., ` +
        `que las partes declaran conocer y aceptar.`,
    },
    {
      type: "clause",
      num: "8",
      text: `DOMICILIO: Para todos los efectos las partes fijan su domicilio en la Ciudad y Comuna de Santiago.`,
    },
    { type: "spacer" },
    {
      type: "paragraph",
      text:
        `Para constancia firman esta ORDEN DE ARRIENDO en dos ejemplares del mismo tenor y fecha, quedando uno en poder de cada parte.`,
    },
    { type: "spacer" },
    {
      type: "signatures",
      columns: [
        { lines: ["Firma Comitente", f(v, "propietario_nombre", ""), f(v, "propietario_rut", "")] },
        { lines: ["Firma Corredor", "Benjamín Cousiño Propiedades SpA.", "Andrea Bonhomme"] },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// ESPAÑA — MANDATO DE ALQUILER (formato oficial provisto)
// ---------------------------------------------------------------------------
const mandatoAlquilerES: DocTemplate = {
  id: "es-mandato-alquiler",
  country: "es",
  category: "alquiler",
  name: "Mandato de Alquiler",
  subtitle: "Encargo de intermediación de arrendamiento del propietario a la Agencia.",
  roles: ["ejecutivo", "propietario", "arrendador"],
  fields: [
    { key: "ciudad", label: "Ciudad", placeholder: "Madrid" },
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "propietario_nombre", label: "Propietario (D./Dª.)", placeholder: "Nombre completo", full: true },
    { key: "propietario_dni", label: "DNI / NIE", placeholder: "00000000X" },
    { key: "propietario_domicilio", label: "Domicilio del propietario", placeholder: "Calle, nº, ciudad", full: true },
    { key: "inmueble_direccion", label: "Dirección del inmueble", placeholder: "Calle, nº, planta, ciudad", full: true },
  ],
  build: (v) => [
    { type: "paragraph", text: `En ${f(v, "ciudad", "Madrid")}, a ${f(v, "fecha")}.` },
    { type: "heading", text: "REUNIDOS" },
    {
      type: "paragraph",
      text:
        `De una parte, BENJAMÍN COUSIÑO PROPIEDADES S.L., sociedad de responsabilidad limitada, CIF B19444561, con ` +
        `domicilio social en Calle Serrano, 19 – Planta 4 Derecha, 28001 Madrid, representada por D. Benjamín Cousiño, ` +
        `Administrador Único (en adelante, "LA AGENCIA").`,
    },
    {
      type: "paragraph",
      text:
        `Y de otra parte, D./Dª. ${f(v, "propietario_nombre")}, con DNI/NIE nº ${f(v, "propietario_dni")}, y domicilio en ` +
        `${f(v, "propietario_domicilio")} (en adelante, "EL PROPIETARIO").`,
    },
    { type: "heading", text: "EXPONEN" },
    {
      type: "paragraph",
      text: `I. Que EL PROPIETARIO es titular del inmueble ubicado en ${f(v, "inmueble_direccion")} (en adelante, "el Inmueble").`,
    },
    {
      type: "paragraph",
      text: `II. Que desea arrendar el Inmueble y encarga a LA AGENCIA la intermediación, promoción y gestión del referido arrendamiento.`,
    },
    { type: "paragraph", text: `III. Que ambas partes desean regular mediante el presente documento los términos de dicha intermediación.` },
    { type: "heading", text: "CLÁUSULAS" },
    {
      type: "clause",
      num: "1",
      text:
        `Objeto del mandato. EL PROPIETARIO autoriza a LA AGENCIA a comercializar, mostrar y ofrecer el Inmueble a ` +
        `potenciales arrendatarios, pudiendo publicarlo en portales inmobiliarios, redes sociales o cualquier otro medio ` +
        `físico o digital que considere adecuado.`,
    },
    {
      type: "clause",
      num: "2",
      text:
        `Facultades de la Agencia. LA AGENCIA podrá concertar visitas, recabar documentación y facilitar información del ` +
        `inmueble a terceros interesados, actuando con la máxima diligencia profesional y confidencialidad.`,
    },
    {
      type: "clause",
      num: "3",
      text:
        `Comisión y honorarios. Las partes acuerdan expresamente que los honorarios derivados de la intermediación ` +
        `inmobiliaria de LA AGENCIA serán satisfechos por el cliente o arrendatario presentado por LA AGENCIA, en los ` +
        `términos que se pacten con este, por lo que EL PROPIETARIO no asumirá obligación de pago alguna por dicho ` +
        `concepto, salvo pacto expreso y por escrito entre las partes.`,
    },
    {
      type: "clause",
      num: "4",
      text:
        `Duración del mandato. El presente mandato tendrá una vigencia inicial de 30 días naturales, prorrogable ` +
        `automáticamente salvo comunicación expresa de cualquiera de las partes con al menos 7 días de antelación.`,
    },
    {
      type: "clause",
      num: "5",
      text:
        `Exclusividad. Durante la vigencia del presente mandato, EL PROPIETARIO encomienda a LA AGENCIA, con carácter ` +
        `exclusivo, la promoción, comercialización e intermediación del arrendamiento del Inmueble, comprometiéndose a no ` +
        `encargar dicha gestión a terceros, ya sean otras agencias, intermediarios o particulares, ni a formalizar el ` +
        `arrendamiento al margen de LA AGENCIA.`,
    },
    {
      type: "clause",
      num: "6",
      text:
        `Entrega de llaves. EL PROPIETARIO declara haber entregado a LA AGENCIA, en este acto, un juego de llaves del ` +
        `Inmueble, para facilitar su comercialización, realización de visitas y demás gestiones relacionadas con el ` +
        `arrendamiento. LA AGENCIA se compromete a custodiar dichas llaves con la máxima diligencia y a utilizarlas ` +
        `exclusivamente para actuaciones vinculadas a la gestión del arrendamiento del Inmueble. Finalizado el presente ` +
        `mandato, LA AGENCIA devolverá las llaves a EL PROPIETARIO, salvo que exista una gestión de arrendamiento en curso ` +
        `o pacto distinto entre las partes.`,
    },
    {
      type: "clause",
      num: "7",
      text:
        `Documentación y veracidad. EL PROPIETARIO declara que el Inmueble se encuentra en condiciones de ser arrendado y ` +
        `se compromete a facilitar a LA AGENCIA la documentación necesaria, incluyendo nota simple, certificado de ` +
        `eficiencia energética, recibo de IBI y, en su caso, cédula de habitabilidad.`,
    },
    {
      type: "clause",
      num: "8",
      text:
        `Protección de datos. Ambas partes cumplirán con el Reglamento General de Protección de Datos (UE 2016/679) y la ` +
        `Ley Orgánica 3/2018 (LOPDGDD), actuando como responsables independientes del tratamiento de los datos personales.`,
    },
    {
      type: "clause",
      num: "9",
      text:
        `Legislación y jurisdicción. El presente mandato se rige por la legislación española, sometiéndose las partes a los ` +
        `Juzgados y Tribunales de Madrid para la resolución de cualquier controversia.`,
    },
    { type: "spacer" },
    { type: "paragraph", text: `Y en prueba de conformidad, firman el presente documento por duplicado ejemplar y a un solo efecto.` },
    { type: "spacer" },
    {
      type: "signatures",
      columns: [
        { lines: ["Por EL PROPIETARIO", `D./Dª. ${f(v, "propietario_nombre", "")}`, `DNI/NIE: ${f(v, "propietario_dni", "")}`] },
        { lines: ["Por BENJAMÍN COUSIÑO PROPIEDADES, S.L.", "D. Benjamín Cousiño", "Administrador Único"] },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// ESPAÑA — MANDATO DE VENTA (borrador espejo del Mandato de Alquiler)
// ---------------------------------------------------------------------------
const mandatoVentaES: DocTemplate = {
  id: "es-mandato-venta",
  country: "es",
  category: "venta",
  name: "Mandato de Venta",
  subtitle: "Encargo de intermediación de compraventa del propietario a la Agencia.",
  roles: ["ejecutivo", "propietario"],
  reviewNote:
    "Borrador basado en el Mandato de Alquiler. Revisar honorarios y condiciones de exclusividad antes de usar.",
  fields: [
    { key: "ciudad", label: "Ciudad", placeholder: "Madrid" },
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "propietario_nombre", label: "Propietario (D./Dª.)", placeholder: "Nombre completo", full: true },
    { key: "propietario_dni", label: "DNI / NIE", placeholder: "00000000X" },
    { key: "propietario_domicilio", label: "Domicilio del propietario", placeholder: "Calle, nº, ciudad", full: true },
    { key: "inmueble_direccion", label: "Dirección del inmueble", placeholder: "Calle, nº, planta, ciudad", full: true },
    { key: "precio_venta", label: "Precio de venta (€)", type: "number", placeholder: "0" },
    { key: "honorarios_pct", label: "Honorarios (%)", placeholder: "3" },
  ],
  build: (v) => [
    { type: "paragraph", text: `En ${f(v, "ciudad", "Madrid")}, a ${f(v, "fecha")}.` },
    { type: "heading", text: "REUNIDOS" },
    {
      type: "paragraph",
      text:
        `De una parte, BENJAMÍN COUSIÑO PROPIEDADES S.L., sociedad de responsabilidad limitada, CIF B19444561, con ` +
        `domicilio social en Calle Serrano, 19 – Planta 4 Derecha, 28001 Madrid, representada por D. Benjamín Cousiño, ` +
        `Administrador Único (en adelante, "LA AGENCIA").`,
    },
    {
      type: "paragraph",
      text:
        `Y de otra parte, D./Dª. ${f(v, "propietario_nombre")}, con DNI/NIE nº ${f(v, "propietario_dni")}, y domicilio en ` +
        `${f(v, "propietario_domicilio")} (en adelante, "EL PROPIETARIO").`,
    },
    { type: "heading", text: "EXPONEN" },
    {
      type: "paragraph",
      text: `I. Que EL PROPIETARIO es titular en pleno dominio del inmueble ubicado en ${f(v, "inmueble_direccion")} (en adelante, "el Inmueble").`,
    },
    {
      type: "paragraph",
      text: `II. Que desea vender el Inmueble por un precio de ${f(v, "precio_venta", "________")} € y encarga a LA AGENCIA la intermediación, promoción y gestión de la referida compraventa.`,
    },
    { type: "paragraph", text: `III. Que ambas partes desean regular mediante el presente documento los términos de dicha intermediación.` },
    { type: "heading", text: "CLÁUSULAS" },
    {
      type: "clause",
      num: "1",
      text:
        `Objeto del mandato. EL PROPIETARIO autoriza a LA AGENCIA a comercializar, mostrar y ofrecer el Inmueble a ` +
        `potenciales compradores, pudiendo publicarlo en portales inmobiliarios, redes sociales o cualquier otro medio ` +
        `físico o digital que considere adecuado, así como a tomar fotografías del inmueble para su promoción.`,
    },
    {
      type: "clause",
      num: "2",
      text:
        `Facultades de la Agencia. LA AGENCIA podrá concertar visitas, recabar documentación y facilitar información del ` +
        `inmueble a terceros interesados, actuando con la máxima diligencia profesional y confidencialidad.`,
    },
    {
      type: "clause",
      num: "3",
      text:
        `Honorarios. EL PROPIETARIO pagará a LA AGENCIA, en concepto de honorarios por la intermediación, el ` +
        `${f(v, "honorarios_pct", "____")}% más IVA sobre el precio final de la compraventa, que se devengarán en el ` +
        `momento de la firma del contrato de arras o, en su defecto, de la escritura pública de compraventa.`,
    },
    {
      type: "clause",
      num: "4",
      text:
        `Duración del mandato. El presente mandato tendrá una vigencia inicial de 90 días naturales, prorrogable ` +
        `automáticamente por períodos iguales salvo comunicación expresa de cualquiera de las partes con al menos 15 días ` +
        `de antelación.`,
    },
    {
      type: "clause",
      num: "5",
      text:
        `Exclusividad. Durante la vigencia del presente mandato, EL PROPIETARIO encomienda a LA AGENCIA, con carácter ` +
        `exclusivo, la promoción, comercialización e intermediación de la compraventa del Inmueble, comprometiéndose a no ` +
        `encargar dicha gestión a terceros ni a formalizar la venta al margen de LA AGENCIA.`,
    },
    {
      type: "clause",
      num: "6",
      text:
        `Documentación y veracidad. EL PROPIETARIO declara que dispone de la documentación en regla (nota simple, ` +
        `certificado de eficiencia energética, último recibo de IBI y, en su caso, cédula de habitabilidad) y se ` +
        `compromete a facilitarla a LA AGENCIA, respondiendo de la veracidad de los datos aportados.`,
    },
    {
      type: "clause",
      num: "7",
      text:
        `Protección de datos. Ambas partes cumplirán con el Reglamento General de Protección de Datos (UE 2016/679) y la ` +
        `Ley Orgánica 3/2018 (LOPDGDD), actuando como responsables independientes del tratamiento de los datos personales.`,
    },
    {
      type: "clause",
      num: "8",
      text:
        `Legislación y jurisdicción. El presente mandato se rige por la legislación española, sometiéndose las partes a los ` +
        `Juzgados y Tribunales de Madrid para la resolución de cualquier controversia.`,
    },
    { type: "spacer" },
    { type: "paragraph", text: `Y en prueba de conformidad, firman el presente documento por duplicado ejemplar y a un solo efecto.` },
    { type: "spacer" },
    {
      type: "signatures",
      columns: [
        { lines: ["Por EL PROPIETARIO", `D./Dª. ${f(v, "propietario_nombre", "")}`, `DNI/NIE: ${f(v, "propietario_dni", "")}`] },
        { lines: ["Por BENJAMÍN COUSIÑO PROPIEDADES, S.L.", "D. Benjamín Cousiño", "Administrador Único"] },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// ESPAÑA — PERSONAL SHOPPER INMOBILIARIO (borrador)
// ---------------------------------------------------------------------------
const personalShopperES: DocTemplate = {
  id: "es-personal-shopper",
  country: "es",
  category: "personal_shopper",
  name: "Personal Shopper Inmobiliario",
  subtitle: "Encargo de búsqueda personalizada del cliente comprador/arrendatario a la Agencia.",
  roles: ["ejecutivo", "comprador", "arrendatario"],
  reviewNote:
    "Borrador de servicio Personal Shopper. Revisar honorarios (equivalentes a un mes de renta) antes de usar.",
  fields: [
    { key: "ciudad", label: "Ciudad", placeholder: "Madrid" },
    { key: "fecha", label: "Fecha", type: "date" },
    { key: "cliente_nombre", label: "Cliente (D./Dª.)", placeholder: "Nombre completo", full: true },
    { key: "cliente_dni", label: "DNI / NIE", placeholder: "00000000X" },
    { key: "cliente_domicilio", label: "Domicilio del cliente", placeholder: "Calle, nº, ciudad", full: true },
    { key: "zona_busqueda", label: "Zona de búsqueda", placeholder: "Barrio / municipio", full: true },
    { key: "tipo_operacion", label: "Operación", placeholder: "Compra / Alquiler" },
    { key: "presupuesto", label: "Presupuesto máximo (€)", type: "number", placeholder: "0" },
    { key: "caracteristicas", label: "Características deseadas", placeholder: "Habitaciones, m², extras…", type: "textarea", full: true },
  ],
  build: (v) => [
    { type: "paragraph", text: `En ${f(v, "ciudad", "Madrid")}, a ${f(v, "fecha")}.` },
    { type: "heading", text: "REUNIDOS" },
    {
      type: "paragraph",
      text:
        `De una parte, BENJAMÍN COUSIÑO PROPIEDADES S.L., CIF B19444561, con domicilio social en Calle Serrano, 19 – ` +
        `Planta 4 Derecha, 28001 Madrid, representada por D. Benjamín Cousiño, Administrador Único (en adelante, "LA AGENCIA").`,
    },
    {
      type: "paragraph",
      text:
        `Y de otra parte, D./Dª. ${f(v, "cliente_nombre")}, con DNI/NIE nº ${f(v, "cliente_dni")}, y domicilio en ` +
        `${f(v, "cliente_domicilio")} (en adelante, "EL CLIENTE").`,
    },
    { type: "heading", text: "OBJETO" },
    {
      type: "paragraph",
      text:
        `EL CLIENTE encarga a LA AGENCIA el servicio de Personal Shopper Inmobiliario, consistente en la búsqueda, ` +
        `selección, negociación y asesoramiento para la ${f(v, "tipo_operacion", "compra/alquiler")} de un inmueble en la ` +
        `zona de ${f(v, "zona_busqueda")}, con un presupuesto máximo de ${f(v, "presupuesto", "________")} € y las ` +
        `siguientes características: ${f(v, "caracteristicas")}.`,
    },
    { type: "heading", text: "CLÁUSULAS" },
    {
      type: "clause",
      num: "1",
      text:
        `Servicio. LA AGENCIA realizará una búsqueda personalizada y proactiva, preseleccionando inmuebles que se ajusten ` +
        `a los criterios del CLIENTE, organizando visitas y acompañándole durante todo el proceso hasta el cierre de la operación.`,
    },
    {
      type: "clause",
      num: "2",
      text:
        `Honorarios. El servicio de Personal Shopper tendrá un coste equivalente a un mes de alquiler/renta (en operaciones ` +
        `de arrendamiento) o al porcentaje que se pacte por escrito (en operaciones de compra). Los honorarios se validan y ` +
        `devengan cuando EL CLIENTE formaliza oficialmente la operación con Benjamín Cousiño Propiedades.`,
    },
    {
      type: "clause",
      num: "3",
      text:
        `Duración. El presente encargo tendrá una vigencia de 90 días naturales, prorrogable de mutuo acuerdo entre las partes.`,
    },
    {
      type: "clause",
      num: "4",
      text:
        `Colaboración. EL CLIENTE se compromete a facilitar la documentación necesaria para la operación y a canalizar a ` +
        `través de LA AGENCIA cualquier inmueble que le haya sido presentado por esta.`,
    },
    {
      type: "clause",
      num: "5",
      text:
        `Protección de datos. Ambas partes cumplirán con el Reglamento General de Protección de Datos (UE 2016/679) y la ` +
        `Ley Orgánica 3/2018 (LOPDGDD).`,
    },
    {
      type: "clause",
      num: "6",
      text:
        `Legislación y jurisdicción. El presente contrato se rige por la legislación española, sometiéndose las partes a los ` +
        `Juzgados y Tribunales de Madrid.`,
    },
    { type: "spacer" },
    { type: "paragraph", text: `Y en prueba de conformidad, firman el presente documento por duplicado ejemplar y a un solo efecto.` },
    { type: "spacer" },
    {
      type: "signatures",
      columns: [
        { lines: ["EL CLIENTE", `D./Dª. ${f(v, "cliente_nombre", "")}`, `DNI/NIE: ${f(v, "cliente_dni", "")}`] },
        { lines: ["Por BENJAMÍN COUSIÑO PROPIEDADES, S.L.", "D. Benjamín Cousiño", "Administrador Único"] },
      ],
    },
  ],
};

export const DOC_TEMPLATES: DocTemplate[] = [
  // España
  mandatoVentaES,
  mandatoAlquilerES,
  personalShopperES,
  // Chile
  ordenVentaCL,
  ordenArriendoCL,
];

export function getTemplatesByCountry(country: Country): DocTemplate[] {
  return DOC_TEMPLATES.filter((t) => t.country === country);
}

export function getTemplateById(id: string): DocTemplate | undefined {
  return DOC_TEMPLATES.find((t) => t.id === id);
}

export const ROLE_LABELS: Record<DocRole, string> = {
  ejecutivo: "Ejecutivo",
  propietario: "Propietario",
  arrendador: "Arrendador",
  comprador: "Comprador",
  arrendatario: "Arrendatario",
};
