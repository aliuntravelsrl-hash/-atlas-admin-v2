/**
 * OVR Contract Interpreter
 * Mapea las tareas al OVR Schema v1 / COS-v3.5
 */

export function interpretOVRContract(task) {
  if (!task) return null;

  // Si existe resultado_estructurado (Etapa II / payload JSONB en el futuro)
  if (task.resultado_estructurado && typeof task.resultado_estructurado === 'object') {
    return mapOVRStructure(task, task.resultado_estructurado);
  }

  // Si es un JSON string en resultado_estructurado
  if (task.resultado_estructurado && typeof task.resultado_estructurado === 'string') {
    try {
      const parsed = JSON.parse(task.resultado_estructurado);
      if (parsed && typeof parsed === 'object') {
        return mapOVRStructure(task, parsed);
      }
    } catch (e) {
      console.warn("Error parsing resultado_estructurado as JSON:", e);
    }
  }

  // De lo contrario, intentar interpretar desde la descripcion (Etapa I / compatibilidad)
  if (!task.descripcion) {
    return {
      isLegacy: true,
      identity: { id: task.codigo, title: task.titulo },
      lifecycle: { state: task.estado, updated_at: task.updated_at },
      execution: null
    };
  }

  const parsedBlocks = parseDescriptionBlocks(task.descripcion);
  if (!parsedBlocks) {
    // Es una tarea legada sin formato estructurado
    return {
      isLegacy: true,
      identity: { id: task.codigo, title: task.titulo },
      lifecycle: { state: task.estado, updated_at: task.updated_at },
      execution: null
    };
  }

  // Retornar estructura mapeada a OVR Schema v1
  return mapOVRStructure(task, parsedBlocks);
}

function parseDescriptionBlocks(text) {
  const lines = text.split('\n');
  const blocks = {
    problem: '',
    testCase: '',
    incorrect: '',
    correct: '',
    probableCause: '',
    filesToReview: [],
    promotionFlow: ''
  };

  let currentSection = null;
  let sectionContent = [];

  const sectionMarkers = [
    { key: 'problem', patterns: [/1_problema_detectado/i, /Problema Detectado/i] },
    { key: 'testCase', patterns: [/2_datos_reales_caso_prueba/i, /2_datos_reales/i, /Caso de Prueba/i, /Datos Reales/i] },
    { key: 'incorrect_vs_correct', patterns: [/3_incorrecto_vs_correcto/i, /Incorrecto vs Correcto/i] },
    { key: 'probableCause', patterns: [/4_causa_probable/i, /Causa Probable/i] },
    { key: 'filesToReview', patterns: [/5_archivos_a_revisar/i, /Archivos a Revisar/i, /Archivos Afectados/i] },
    { key: 'promotionFlow', patterns: [/6_flujo_promocion/i, /Flujo de Promocion/i, /Flujo de Promoción/i] }
  ];

  function detectSection(line) {
    // Detectar encabezado Markdown "### 1. ..." o campos YAML "1_problema_detectado:"
    for (const marker of sectionMarkers) {
      for (const pattern of marker.patterns) {
        if (pattern.test(line) && (line.includes(':') || line.startsWith('#') || line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.') || line.startsWith('4.') || line.startsWith('5.') || line.startsWith('6.'))) {
          return marker.key;
        }
      }
    }
    return null;
  }

  let detectedAny = false;

  for (let line of lines) {
    const section = detectSection(line);
    if (section) {
      detectedAny = true;
      // Guardar sección previa
      if (currentSection) {
        saveSection(currentSection, sectionContent, blocks);
      }
      currentSection = section;
      sectionContent = [];
    } else {
      if (currentSection) {
        sectionContent.push(line);
      }
    }
  }

  // Guardar última sección
  if (currentSection) {
    saveSection(currentSection, sectionContent, blocks);
  }

  if (!detectedAny) {
    // Si no detectó ninguna sección estructurada
    return null;
  }

  return blocks;
}

function saveSection(key, lines, blocks) {
  const content = lines.map(line => {
    // Limpiar pipelines de bloque YAML "|" o guiones
    let clean = line.trim();
    if (clean === '|') return '';
    return line;
  }).join('\n').trim();

  if (key === 'incorrect_vs_correct') {
    // Intentar separar incorrecto de correcto
    const incorrectMatch = content.match(/incorrecto:\s*([\s\S]*?)(?=correcto:|$)/i);
    const correctMatch = content.match(/correcto:\s*([\s\S]*)/i);

    if (incorrectMatch) {
      blocks.incorrect = incorrectMatch[1].replace(/^["'|]+|["'|]+$/g, '').trim();
    }
    if (correctMatch) {
      blocks.correct = correctMatch[1].replace(/^["'|]+|["'|]+$/g, '').trim();
    }

    // Si falló regex YAML, intentar con viñetas o formato libre
    if (!blocks.incorrect && !blocks.correct) {
      const parts = content.split(/[-*]\s*(?:Incorrecto|Correcto):/gi);
      if (parts.length >= 3) {
        blocks.incorrect = parts[1].trim();
        blocks.correct = parts[2].trim();
      } else {
        blocks.incorrect = content;
      }
    }
  } else if (key === 'filesToReview') {
    // Buscar líneas con archivos (normalmente empiezan con - o *)
    const fileLines = content.split('\n');
    const files = [];
    for (const fLine of fileLines) {
      const match = fLine.match(/[-*]?\s*([a-zA-Z0-9_\-\.\/\\: ]+\.[a-zA-Z0-9]+)/);
      if (match) {
        files.push(match[1].trim());
      }
    }
    blocks.filesToReview = files.length > 0 ? files : [content];
  } else {
    // Limpiar comillas/tuberías iniciales/finales de YAML
    let cleanVal = content.replace(/^["'|]+|["'|]+$/g, '').trim();
    blocks[key] = cleanVal;
  }
}

function mapOVRStructure(task, parsed) {
  return {
    isLegacy: false,
    identity: {
      id: task.codigo,
      title: task.titulo,
      type: task.tipo || 'proyecto'
    },
    ownership: {
      authorizedBy: task.autorizado_por || null,
      requestedBy: task.encargado_por || null
    },
    capability: {
      // Buscar CAP-XXX en el código o descripción
      id: extractCapabilityId(task.codigo, task.titulo, task.descripcion)
    },
    knowledge: {
      kbp: task.frente || 'General',
      agent: task.ejecutor || null
    },
    execution: {
      problem: parsed.problem || parsed['1_problema_detectado'] || null,
      testCase: parsed.testCase || parsed['2_datos_reales_caso_prueba'] || parsed['2_datos_reales'] || null,
      incorrect: parsed.incorrect || (parsed['3_incorrecto_vs_correcto'] && parsed['3_incorrecto_vs_correcto'].incorrecto) || null,
      correct: parsed.correct || (parsed['3_incorrecto_vs_correcto'] && parsed['3_incorrecto_vs_correcto'].correcto) || null,
      probableCause: parsed.probableCause || parsed['4_causa_probable'] || null,
      filesToReview: parsed.filesToReview || parsed['5_archivos_a_revisar'] || []
    },
    dependencies: {
      blocked: task.bloqueado || false,
      reason: task.bloqueo_razon || null,
      dependsOn: task.depende_de || null
    },
    evidence: {
      url: task.evidencia_url || null,
      result: task.resultado || null
    },
    governance: {
      activeProtocols: task.workflow_id ? [task.workflow_id] : [],
      architectureOwner: task.responsable_arquitectura || 'ATLAS-TECH'
    },
    decision: {
      rationale: task.notas || null
    },
    lifecycle: {
      state: task.estado,
      updated_at: task.updated_at
    }
  };
}

function extractCapabilityId(code, title, desc) {
  const capRegex = /(CAP-\d+)/i;
  let match = code.match(capRegex);
  if (match) return match[1].toUpperCase();
  match = title.match(capRegex);
  if (match) return match[1].toUpperCase();
  if (desc) {
    match = desc.match(capRegex);
    if (match) return match[1].toUpperCase();
  }
  return null;
}
