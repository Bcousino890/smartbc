// SmartLink 2.0 · introducciones de barrio.
//
// Reglas que impone el sprint y verifica build-neighborhood-migration.mjs:
//   · 35-70 palabras
//   · NUNCA minutos ni distancias (los calcula poi-distance.ts con las coords
//     reales de la propiedad; escribirlos aquí sería inventarlos)
//   · hechos comprobables — adscripción administrativa, trama urbana, época de
//     edificación, equipamientos que existen — no adjetivos de folleto
//
// Fuente de la adscripción barrio→distrito: Ayuntamiento de Madrid
// (madrid.es, Distritos y barrios). Pozuelo de Alarcón es municipio propio.

export const INTROS = {
  // ── Distrito Salamanca ──────────────────────────────────────────────
  castellana: `Castellana es uno de los seis barrios del distrito de Salamanca, el que se apoya en el paseo del mismo nombre. Su trama es la del Plan Castro de 1860: manzanas rectangulares y calles anchas y arboladas. Buena parte de los palacetes decimonónicos que lo ocupan son hoy embajadas, fundaciones y sedes corporativas, entre edificios de vivienda de techos altos.`,

  lista: `Lista es el barrio más pequeño del distrito de Salamanca, delimitado por Ortega y Gasset, Juan Bravo, Príncipe de Vergara y el paseo de la Castellana. Es residencial, con comercio a pie de calle y edificación cerrada del ensanche del siglo XIX y principios del XX. Toma el nombre de la antigua calle de Lista, hoy José Ortega y Gasset.`,

  goya: `El barrio de Goya ocupa el sur del distrito de Salamanca, entre O'Donnell, Doctor Esquerdo, Ramón de la Cruz y Menéndez Pelayo. La calle de Goya lo atraviesa y concentra su comercio. Predomina la vivienda de media altura del ensanche, y dentro de sus límites están la Fábrica Nacional de Moneda y Timbre y el antiguo Palacio de los Deportes.`,

  "fuente-del-berro": `Fuente del Berro es un barrio residencial del distrito de Salamanca, al este de la calle de Doctor Esquerdo. Creció fuera de las rondas a partir de los años veinte con colonias de casas unifamiliares que todavía se conservan entre edificación posterior. Su referencia verde es el parque de la Quinta de la Fuente del Berro, jardín histórico de origen barroco.`,

  guindalera: `La Guindalera se urbanizó fuera de las rondas a partir de los años veinte, cuando esta zona era todavía las afueras de Madrid, y hoy es el barrio de trama más menuda del distrito de Salamanca. Conserva la colonia del Madrid Moderno, de casas neomudéjares, y limita por el este con la plaza de toros de Las Ventas.`,

  // ── Distrito Chamartín ──────────────────────────────────────────────
  "el-viso": `El Viso es una colonia de hotelitos proyectada en los años treinta dentro del distrito de Chamartín, entre Serrano, María de Molina y el paseo de la Castellana. Se levantó como ciudad jardín de trazas racionalistas: viviendas unifamiliares de dos y tres plantas, jardín propio y calles de poco tráfico. Es de las pocas zonas de baja densidad dentro de la almendra central.`,

  hispanoamerica: `Hispanoamérica es un barrio del distrito de Chamartín, al norte de la avenida de Concha Espina y al este del paseo de la Castellana. Se desarrolló entre los años cincuenta y setenta con bloques abiertos, zonas ajardinadas entre edificios y calles que llevan nombres de países americanos. El estadio Santiago Bernabéu queda junto a su límite oeste.`,

  "nueva-espana": `Nueva España es un barrio del distrito de Chamartín levantado entre los años cincuenta y sesenta al norte de la avenida de Alfonso XIII. Alterna bloques abiertos con colonias de vivienda unifamiliar, de modo que su densidad es baja para la zona. El parque de Berlín, abierto en 1967 sobre antiguos terrenos ferroviarios, es su principal espacio verde.`,

  // ── Distrito Tetuán ─────────────────────────────────────────────────
  castillejos: `Castillejos es un barrio del distrito de Tetuán, al oeste del paseo de la Castellana y a la altura de la plaza de Cuzco. Se construyó sobre todo en los años sesenta, con bloques de altura sobre trama regular y la calle de Orense como eje comercial. El complejo de oficinas de AZCA queda inmediatamente al sur.`,

  // ── Distrito Chamberí ───────────────────────────────────────────────
  trafalgar: `Trafalgar es uno de los seis barrios de Chamberí, entre Santa Engracia, Carranza y la glorieta de Bilbao. Es de trama ortogonal y edificación cerrada del siglo XIX, con abundancia de fachadas neomudéjares y modernistas. La plaza de Olavide, resultado del derribo de su antiguo mercado cubierto, funciona como centro del barrio.`,

  "rios-rosas": `Ríos Rosas es el barrio de Chamberí situado entre José Abascal y Raimundo Fernández Villaverde, continuación al norte de Almagro. Sus calles son ortogonales y la edificación mezcla vivienda del ensanche con equipamiento institucional: la Escuela de Minas y su Museo Geominero, y los depósitos del Canal de Isabel II. Nuevos Ministerios queda en su extremo oriental.`,

  // ── Distrito Centro ─────────────────────────────────────────────────
  malasana: `Malasaña es el nombre con el que se conoce el barrio de Universidad, en el distrito Centro, entre Fuencarral, Carranza, San Bernardo y la Gran Vía. Su trazado es anterior al ensanche: calles estrechas, manzanas irregulares y edificación de baja y media altura. La plaza del Dos de Mayo ocupa el solar del antiguo cuartel de Monteleón.`,

  chueca: `Chueca es el nombre popular del barrio de Justicia, en el distrito Centro, entre Fuencarral, la Gran Vía, Recoletos y Génova. Combina calles estrechas de trazado antiguo con el eje más señorial de Almirante y Barquillo. Es zona de comercio a pie de calle y hostelería densa, con el mercado de San Antón como referencia.`,

  lavapies: `Lavapiés ocupa la parte alta del barrio de Embajadores, en el distrito Centro, entre Atocha, la calle de Embajadores y la ronda de Valencia. Su trazado es de origen medieval y en pendiente, con corralas todavía en pie. Alberga equipamientos culturales como Tabacalera y La Casa Encendida, y el Reina Sofía queda en su borde este.`,

  // ── Distrito Retiro ─────────────────────────────────────────────────
  ibiza: `Ibiza es un barrio del distrito de Retiro delimitado por Menéndez Pelayo, O'Donnell, Doctor Esquerdo y Sainz de Baranda. Da directamente al parque del Retiro por su lado oeste. La edificación combina manzana cerrada del ensanche con promociones de posguerra, es mayoritariamente residencial y tiene la calle de Ibiza como eje comercial.`,

  "nino-jesus": `Niño Jesús es un barrio del distrito de Retiro situado al sur de Sainz de Baranda, junto al límite meridional del parque del Retiro. Toma su nombre del hospital infantil abierto en 1877 en la avenida de Menéndez Pelayo, el primero de España dedicado a la infancia. Es residencial y de densidad menor que los barrios contiguos.`,

  estrella: `Estrella es un barrio del distrito de Retiro, al este de Doctor Esquerdo y al sur de O'Donnell. Se construyó en su mayor parte entre los años cuarenta y sesenta con bloques abiertos y colonias, de modo que abunda el espacio libre entre edificios. El hospital Gregorio Marañón queda junto a su borde noroeste.`,

  // ── Municipio de Pozuelo de Alarcón ─────────────────────────────────
  somosaguas: `Somosaguas es una zona residencial del municipio de Pozuelo de Alarcón, al oeste de Madrid y contigua a la Casa de Campo. Está formada por urbanizaciones de vivienda unifamiliar con parcela y apenas tiene edificación en altura. El campus de Somosaguas de la Universidad Complutense, con las facultades de Ciencias Sociales, ocupa su extremo norte.`,

  // ── Municipio de Torrelodones ───────────────────────────────────────
  torrelodones: `Torrelodones es un municipio del noroeste de la Comunidad de Madrid, en el piedemonte de la sierra de Guadarrama y a unos veintinueve kilómetros de la capital. Se organiza en dos núcleos principales: el casco antiguo y la Colonia, surgida en el último tercio del siglo XIX alrededor de la estación de ferrocarril. Predomina la vivienda unifamiliar con parcela.`,

  "prado-de-somosaguas": `Prado de Somosaguas es una urbanización del municipio de Pozuelo de Alarcón, contigua a Somosaguas por el oeste. Se desarrolló como área residencial de baja densidad, con viviendas unifamiliares y adosadas sobre calles de trazado curvo y sin tráfico de paso. Los servicios y el comercio del casco de Pozuelo quedan al norte.`,
};
