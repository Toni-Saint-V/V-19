import type { AgentDrawerTab } from './Drawer';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Filter, Download, MoreVertical, FileText, 
  Image as ImageIcon, CheckCircle2, AlertCircle, Clock 
} from 'lucide-react';

type FileCategory = 'all' | 'passports' | 'selfies' | 'financial' | 'other';
type FileStatus = 'verified' | 'processing' | 'error';

interface MediaScreenProps {
  onOpenDrawer?: (id: string, tab?: AgentDrawerTab) => void;
}

interface MediaFile {
  id: string;
  name: string;
  type: 'pdf' | 'image';
  category: FileCategory;
  size: string;
  status: FileStatus;
  applicant: string;
  submissionId: string;
  date: string;
}

const mockFiles: MediaFile[] = [
  { id: '1', name: 'Passport_Petrov_I.pdf', type: 'pdf', category: 'passports', size: '2.4 MB', status: 'verified', applicant: 'Иван Петров', submissionId: 'SUB-1042', date: 'Сегодня, 10:45' },
  { id: '2', name: 'Selfie_Front.jpg', type: 'image', category: 'selfies', size: '850 KB', status: 'verified', applicant: 'Иван Петров', submissionId: 'SUB-1042', date: 'Сегодня, 10:45' },
  { id: '3', name: 'Bank_Statement_Tinkoff.pdf', type: 'pdf', category: 'financial', size: '1.1 MB', status: 'processing', applicant: 'Анна Петрова', submissionId: 'SUB-1042', date: 'Сегодня, 11:20' },
  { id: '4', name: 'Marriage_Certificate.pdf', type: 'pdf', category: 'other', size: '3.2 MB', status: 'error', applicant: 'Семья Петровых', submissionId: 'SUB-1042', date: 'Сегодня, 11:25' },
  { id: '5', name: 'Passport_Smirnova.pdf', type: 'pdf', category: 'passports', size: '4.5 MB', status: 'verified', applicant: 'Алина Смирнова', submissionId: 'SUB-1057', date: 'Вчера, 16:30' },
  { id: '6', name: 'Booking_Hotel_Madrid.pdf', type: 'pdf', category: 'other', size: '500 KB', status: 'verified', applicant: 'Алина Смирнова', submissionId: 'SUB-1057', date: 'Вчера, 16:32' },
];

export function MediaScreen({ onOpenDrawer }: MediaScreenProps = {}) {
  const [activeTab, setActiveTab] = useState<FileCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredFiles = mockFiles.filter(f => 
    (activeTab === 'all' || f.category === activeTab) &&
    (f.name.toLowerCase().includes(searchQuery.toLowerCase()) || f.applicant.toLowerCase().includes(searchQuery.toLowerCase()) || f.submissionId.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getStatusIcon = (status: FileStatus) => {
    switch (status) {
      case 'verified': return <CheckCircle2 className="w-3.5 h-3.5 text-[#b8baff]" />;
      case 'processing': return <Clock className="w-3.5 h-3.5 text-[#b8baff]" />;
      case 'error': return <AlertCircle className="w-3.5 h-3.5 text-[#d59aa3]" />;
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 lg:space-y-8 h-full flex flex-col"
    >
      {/* Top Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between shrink-0">
        <div className="flex bg-[#161617] p-1 border border-[#242529] rounded-[11px] overflow-x-auto scrollbar-hide">
          {[
            { id: 'all', label: 'Все файлы' },
            { id: 'passports', label: 'Паспорта' },
            { id: 'selfies', label: 'Селфи' },
            { id: 'financial', label: 'Финансы' }
          ].map(tab => (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as FileCategory)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${
                activeTab === tab.id ? 'bg-[#27272b] text-white shadow-sm border border-[#2e2f34]' : 'text-white/50 hover:text-white/80 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input 
              type="text" 
              placeholder="Поиск по файлам..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 bg-[#161617] border border-[#242529] rounded-[10px] pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30 transition-all outline-none"
            />
          </div>
          <button className="w-10 h-10 shrink-0 bg-[#161617] hover:bg-[#1a1a1d] border border-[#242529] rounded-[10px] flex items-center justify-center text-white/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto pb-4 scrollbar-thin scrollbar-thumb-white/10">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 lg:gap-4">
          <AnimatePresence>
            {filteredFiles.map((file) => (
              <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                key={file.id}
                onClick={() => onOpenDrawer?.(file.submissionId, 'files')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpenDrawer?.(file.submissionId, 'files');
                  }
                }}
                className="group flex flex-col bg-[#161617] border border-[#242529] rounded-2xl overflow-hidden hover:border-[#6f64ff]/40 transition-all cursor-pointer shadow-[0_4px_20px_rgba(0,0,0,0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                tabIndex={0}
              >
                {/* Preview Area */}
                <div className="aspect-[4/3] bg-[#101011] relative border-b border-[#242529] flex flex-col items-center justify-center overflow-hidden">
                  {file.status === 'error' && <div className="absolute inset-0 bg-[#a35f69]/5 mix-blend-overlay" />}
                  
                  {file.type === 'pdf' ? (
                    <div className="w-14 h-16 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center shadow-inner group-hover:scale-105 transition-transform duration-300">
                      <FileText className="w-6 h-6 text-white/40" />
                    </div>
                  ) : (
                    <div className="w-full h-full bg-[#1a1a1d] flex items-center justify-center group-hover:scale-105 transition-transform duration-300">
                       <ImageIcon className="w-8 h-8 text-white/20" />
                    </div>
                  )}

                  {/* Overlay Actions */}
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={(event) => event.stopPropagation()} className="w-7 h-7 rounded-md bg-[#161617]/90 backdrop-blur border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={(event) => event.stopPropagation()} className="w-7 h-7 rounded-md bg-[#161617]/90 backdrop-blur border border-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors">
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Status Badge inside preview */}
                  <div className={`absolute bottom-2 left-2 px-2 py-1 rounded-md backdrop-blur-md border border-white/10 text-[10px] font-medium flex items-center gap-1.5 shadow-sm
                    ${file.status === 'verified' ? 'bg-white/[0.045] text-[#b8baff]' : 
                      file.status === 'processing' ? 'bg-white/[0.045] text-[#b8baff]' : 'bg-[#24191b]/60 text-[#d59aa3]'}`}>
                    {getStatusIcon(file.status)}
                    {file.status === 'verified' ? 'Распознано' : file.status === 'processing' ? 'В обработке' : 'Ошибка OCR'}
                  </div>
                </div>

                {/* Metadata */}
                <div className="p-3 bg-gradient-to-b from-[#1a1a1d] to-[#161617] flex-1 flex flex-col">
                  <div className="text-[13px] font-medium text-white truncate group-hover:text-[#b8baff] transition-colors" title={file.name}>
                    {file.name}
                  </div>
                  <div className="text-[11px] text-white/40 mt-1 flex items-center justify-between">
                    <span className="truncate pr-2">{file.applicant}</span>
                    <span className="shrink-0">{file.size}</span>
                  </div>
                  <div className="text-[10px] text-white/30 mt-auto pt-2">{file.date}</div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        
        {filteredFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <Search className="w-5 h-5 text-white/30" />
            </div>
            <h3 className="text-sm font-medium text-white">Файлы не найдены</h3>
            <p className="text-xs text-white/40 mt-1">Попробуйте изменить параметры поиска или фильтры.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
