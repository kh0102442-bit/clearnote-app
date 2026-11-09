function renderCard(node) {
  // 1. تحديد النوع
  const type = node.type || 'custom'; 

  // 2. تحديد الاسم والأيقونة
  let typeLabel = "تصنيف"; 
  let icon = '';

  if (type === 'year') { typeLabel = 'سنة دراسية'; }
  else if (type === 'program') { typeLabel = 'برنامج'; }
  else if (type === 'subject') { typeLabel = 'مادة'; }
  else if (type === 'module_explain') { typeLabel = 'الشرح'; icon = '<i class="fas fa-file-alt" style="color:#27ae60;margin-left:6px"></i>'; }
  else if (type === 'module_video') { typeLabel = 'فيديو'; icon = '<i class="fas fa-video" style="color:#e74c3c;margin-left:6px"></i>'; }
  else if (type === 'module_questions') { typeLabel = 'أسئلة'; icon = '<i class="fas fa-question-circle" style="color:#2980b9;margin-left:6px"></i>'; }
  else if (type === 'module_summary') { typeLabel = 'ملخص'; icon = '<i class="fas fa-clipboard-list" style="color:#8e44ad;margin-left:6px"></i>'; }
  else if (type === 'module_terms') { typeLabel = 'مصطلحات'; icon = '<i class="fas fa-book" style="color:#d35400;margin-left:6px"></i>'; }
  else { typeLabel = 'تبويب فرعي'; } // دي الحماية اللي هتمنع كلمة undefined

  // 3. تجهيز العنوان
  const safeTitle = node.title || 'بدون عنوان';
  const titleHtml = `${icon}${safeTitle}`;
  
  const descHtml = node.description ? `<div class="card-desc">${node.description}</div>` : '';

  // 4. إرجاع الكارت
  return `
    <div class="card-item ${type}" data-node="${node.id}">
      <div class="card-type">${typeLabel}</div>
      <h3 class="card-title">${titleHtml}</h3>
      ${descHtml}
    </div>
  `;
}
