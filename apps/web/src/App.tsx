import { Button } from '@/components/ui/button';

function App() {
  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Setup Test</h1>
      <div className="flex gap-2">
        <Button>Default</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
      </div>
    </div>
  );
}

export default App;
