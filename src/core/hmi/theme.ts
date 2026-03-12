import { createTheme } from '@mui/material/styles';

export const rvDarkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary:    { main: '#4fc3f7' },
    secondary:  { main: '#e94078' },
    success:    { main: '#66bb6a' },
    warning:    { main: '#ffa726' },
    error:      { main: '#ef5350' },
    background: {
      default: 'transparent',
      paper: 'rgba(18, 18, 18, 0.65)',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Arial", sans-serif',
    fontSize: 13,
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: 'transparent' },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          backdropFilter: 'blur(16px)',
          backgroundImage: 'none !important',
          backgroundColor: 'rgba(18, 18, 18, 0.65) !important',
        },
      },
    },
  },
});
