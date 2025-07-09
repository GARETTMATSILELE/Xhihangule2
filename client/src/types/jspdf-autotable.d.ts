import { jsPDF } from 'jspdf';

declare module 'jspdf-autotable' {
  export default function(): void;
}

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
  }
} 