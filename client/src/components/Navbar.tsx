import { Link } from 'react-router-dom';
import { FiCode } from 'react-icons/fi';

const Navbar = () => {
  return (
    <nav className="bg-gray-800 shadow-sm">
      <div className="container-fluid flex justify-between items-center py-4">
        <Link to="/" className="flex items-center gap-2 text-blue-400 font-bold text-xl">
          <FiCode className="text-2xl" />
          <span>TermiCode</span>
        </Link>
      </div>
    </nav>
  );
};

export default Navbar; 