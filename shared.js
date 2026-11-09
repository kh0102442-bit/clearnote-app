function renderCard(node) {
  let typeLabel, icon;
  if (node.type === 'year') { typeLabel = 'سنة دراسية'; icon = ''; }
  else if (node.type === 'program') { typeLabel = 'برنامج'; icon = ''; }
  else if (node.type === 'subject') { typeLabel = 'مادة'; icon = ''; }
  else if (node.type === 'module_explain') { typeLabel = 'الشرح'; icon = '<i class="fas fa-file-alt" style="color:#27ae60;margin-left:6px"></i>'; }
  else if (node.type === 'module_video') { typeLabel = 'فيديو'; icon = '<i class="fas fa-video" style="color:#e74c3c;margin-left:6px"></i>'; }
  else if (node.type === 'module_questions') { typeLabel = 'أسئلة'; icon = '<i class="fas fa-question-circle" style="color:#2980b9;margin-left:6px"></i>'; }
  else if (node.type === 'module_summary') { typeLabel = 'ملخص'; icon = '<i class="fas fa-clipboard-list" style="color:#8e44ad;margin-left:6px"></i>'; }
  else if (node.type === 'module_terms') { typeLabel = 'مصطلحات'; icon = '<i class="fas fa-book" style="color:#d35400;margin-left:6px"></i>'; }
  else { typeLabel = 'تصنيف'; icon = ''; } // <--- السطر الجديد ده

  const titleHtml = `${icon}${node.title}`;
  const descHtml = node.description ? `<div class="card-desc">${node.description}</div>` : '';

  return `
    <div class="card-item ${node.type}" data-node="${node.id}">
      <div class="card-type">${typeLabel}</div>
      <h3 class="card-title">${titleHtml}</h3>
      ${descHtml}
    </div>
  `;
}
