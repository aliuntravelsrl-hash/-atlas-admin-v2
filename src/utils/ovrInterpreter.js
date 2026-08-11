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

function calculateConfidence(ovr) {
  let score = 0;
  // 1. KBP validation (knowledge base presence)
  if (ovr.knowledge.kbp && ovr.knowledge.kbp !== 'General') {
    score += 40;
  } else if (ovr.knowledge.kbp === 'General') {
    score += 20;
  }
  
  // 2. Dependencies safety
  if (ovr.dependencies.blocked) {
    score += 0;
  } else {
    score += 30;
    if (!ovr.dependencies.dependsOn) {
      score += 10;
    }
  }
  
  // 3. Evidence completeness
  if (ovr.evidence.url) {
    score += 20;
  }
  if (ovr.evidence.result) {
    score += 10;
  }
  
  return Math.min(score, 100);
}

function getResolverChain(capId, structuredResolverChain) {
  if (structuredResolverChain) return structuredResolverChain;
  if (!capId) return null;
  const num = capId.replace('CAP-', '');
  return `${capId} ➔ SPEC-${num} ➔ POI ➔ ONP ➔ COS ➔ Constitución`;
}

function mapOVRStructure(task, parsed) {
  const capId = extractCapabilityId(task.codigo, task.titulo, task.descripcion);
  const mapped = {
    isLegacy: false,
    identity: {
      id: task.codigo,
      title: task.titulo,
      type: task.tipo || 'proyecto'
    },
    ownership: {
      authorizedBy: task.autorizado_por || parsed.ownership?.authorizedBy || parsed.authorized_by || null,
      requestedBy: task.encargado_por || parsed.ownership?.requestedBy || parsed.requested_by || null
    },
    capability: {
      id: capId,
      resolverChain: getResolverChain(capId, parsed.capability?.resolverChain || parsed.resolver_chain || parsed.resolverChain)
    },
    knowledge: {
      kbp: task.frente || parsed.knowledge?.kbp || 'General',
      agent: task.ejecutor || parsed.knowledge?.agent || null
    },
    execution: {
      problem: parsed.problem || parsed['1_problema_detectado'] || null,
      testCase: parsed.testCase || parsed['2_datos_reales_caso_prueba'] || parsed['2_datos_reales'] || null,
      incorrect: parsed.incorrect || (parsed['3_incorrecto_vs_correcto'] && parsed['3_incorrecto_vs_correcto'].incorrecto) || parsed.incorrect_code || null,
      correct: parsed.correct || (parsed['3_incorrecto_vs_correcto'] && parsed['3_incorrecto_vs_correcto'].correcto) || parsed.correct_code || null,
      probableCause: parsed.probableCause || parsed['4_causa_probable'] || null,
      filesToReview: parsed.filesToReview || parsed['5_archivos_a_revisar'] || parsed.files_to_review || []
    },
    dependencies: {
      blocked: task.bloqueado || parsed.dependencies?.blocked || false,
      reason: task.bloqueo_razon || parsed.dependencies?.reason || null,
      dependsOn: task.depende_de || parsed.dependencies?.dependsOn || parsed.depends_on || null
    },
    evidence: {
      url: task.evidencia_url || parsed.evidence?.url || parsed.evidencia_url || null,
      result: task.resultado || parsed.evidence?.result || parsed.resultado_ejecucion || null
    },
    governance: {
      activeProtocols: task.workflow_id ? [task.workflow_id] : (parsed.governance?.activeProtocols || []),
      architectureOwner: task.responsable_arquitectura || parsed.governance?.architectureOwner || 'ATLAS-TECH'
    },
    decision: {
      rationale: task.notas || parsed.decision?.rationale || parsed.notes || null,
      source: parsed.decision?.source || parsed.decision_source || 'Director-Manual',
      isEmergencyBypass: parsed.decision?.isEmergencyBypass || parsed.emergency_bypass || false
    },
    fingerprint: {
      knowledgeHash: parsed.fingerprint?.knowledgeHash || parsed.knowledge_hash || 'Pending',
      bundleHash: parsed.fingerprint?.bundleHash || parsed.bundle_hash || 'Pending',
      manifestVersion: parsed.fingerprint?.manifestVersion || parsed.manifest_version || 'COS-v3.5',
      ovrVersion: parsed.fingerprint?.ovrVersion || parsed.ovr_version || 'OVR-v2.0',
      kbpVersion: parsed.fingerprint?.kbpVersion || parsed.kbp_version || 'KBP-v1.0'
    },
    lifecycle: {
      state: task.estado,
      updated_at: task.updated_at
    }
  };

  mapped.confidence = calculateConfidence(mapped);
  return mapped;
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
